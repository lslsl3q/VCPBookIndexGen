"""
VCPBookIndexGen Web API 服务
提供 HTTP 接口供前端调用
"""

import os
import sys
import asyncio
import json
from pathlib import Path
from typing import Optional
from datetime import datetime
from dotenv import load_dotenv  # [lslsl3q 添加]

# [lslsl3q 添加] 加载 .env 文件
load_dotenv()

from fastapi import FastAPI, UploadFile, File, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

# 导入现有模块
from novel_indexer.config import Config, read_file, count_tokens
from novel_indexer.extractor import ChapterExtractor, Chapter
from novel_indexer.summarizer import SpeedSummarizer, DeepSummarizer, BookSummarizer
from novel_indexer.writer import IndexWriter

app = FastAPI(title="VCPBookIndexGen API")

# 允许跨域
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 全局状态
class AppState:
    def __init__(self):
        self.current_task = None
        self.progress = 0
        self.status = "idle"
        self.message = ""
        self.chapters = []
        self.book_name = ""
        self.output_dir = ""
        self.error = None
        # [lslsl3q 添加] main.py 日志输出
        self.main_logs: list[str] = []
        self.main_process = None
        # [lslsl3q 添加] 交互式输入支持
        self.waiting_for_input = False
        self.input_prompt = ""

state = AppState()

# ─────────────────────────────────────────────────────────────
#  数据模型
# ─────────────────────────────────────────────────────────────

class ProcessRequest(BaseModel):
    book_name: Optional[str] = None
    mode: str = "speed"
    pattern: Optional[str] = None

class PatternTestRequest(BaseModel):
    pattern: str
    content: str

# ─────────────────────────────────────────────────────────────
#  工具函数
# ─────────────────────────────────────────────────────────────

def get_output_dir(book_name: str) -> str:
    """获取输出目录"""
    base_dir = Path("output")
    return str(base_dir / f"{book_name}-索引")

# ─────────────────────────────────────────────────────────────
#  API 路由
# ─────────────────────────────────────────────────────────────

@app.get("/")
async def root():
    return {"message": "VCPBookIndexGen API", "version": "1.0.0"}

@app.get("/status")
async def get_status():
    """获取当前处理状态"""
    return {
        "status": state.status,
        "progress": state.progress,
        "message": state.message,
        "book_name": state.book_name,
        "output_dir": state.output_dir,
        "error": state.error
    }

@app.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    """上传书籍文件"""
    if not file.filename.endswith(('.txt', '.md')):
        raise HTTPException(status_code=400, detail="只支持 .txt 和 .md 文件")
    
    # 保存文件
    upload_dir = Path("uploads")
    upload_dir.mkdir(exist_ok=True)
    
    file_path = upload_dir / file.filename
    content = await file.read()
    
    with open(file_path, "wb") as f:
        f.write(content)
    
    # 读取文件信息
    text = content.decode('utf-8', errors='ignore')
    total_chars = len(text)
    total_tokens = count_tokens(text)
    
    # 自动提取章节预览
    extractor = ChapterExtractor(text)
    marks = extractor.auto_extract()
    
    chapters_preview = [
        {"index": m.index, "title": m.title, "line": m.line_number}
        for m in marks[:30]  # 只返回前30个预览
    ]
    
    return {
        "filename": file.filename,
        "file_path": str(file_path),
        "total_chars": total_chars,
        "total_tokens": total_tokens,
        "chapter_count": len(marks),
        "chapters_preview": chapters_preview
    }

@app.post("/test-pattern")
async def test_pattern(request: PatternTestRequest):
    """测试自定义正则表达式"""
    import re
    try:
        pattern = re.compile(request.pattern, re.M)
        lines = request.content.split('\n')
        matches = []
        for i, line in enumerate(lines):
            stripped = line.strip()
            if stripped and pattern.match(stripped):
                matches.append({"line": i + 1, "title": stripped})
        return {"success": True, "matches": matches[:30], "total": len(matches)}
    except Exception as e:
        return {"success": False, "error": str(e)}

@app.post("/process")
async def start_process(
    background_tasks: BackgroundTasks,
    file_path: str,
    book_name: Optional[str] = None,
    mode: str = "speed",
    pattern: Optional[str] = None,
    # [lslsl3q 添加] 任务配置参数
    chunk_size: int = 6000,
    chunk_overlap: int = 200,
    max_concurrency: int = 2,
    rolling_context_max: int = 4000,
    file_encoding: str = "auto",
    output_dir: str = "./output"
):
    """开始处理书籍"""
    if state.status == "processing":
        raise HTTPException(status_code=400, detail="已有任务在处理中")
    
    # 重置状态
    state.status = "processing"
    state.progress = 0
    state.message = "正在初始化..."
    state.error = None
    state.book_name = book_name or Path(file_path).stem
    
    # 启动后台任务 - [lslsl3q 修改] 传递任务配置参数
    background_tasks.add_task(
        process_book_task,
        file_path,
        state.book_name,
        mode,
        pattern,
        chunk_size,
        chunk_overlap,
        max_concurrency,
        rolling_context_max,
        file_encoding,
        output_dir
    )
    
    return {"message": "处理已开始", "book_name": state.book_name}

async def process_book_task(
    file_path: str, 
    book_name: str, 
    mode: str, 
    pattern: Optional[str],
    # [lslsl3q 添加] 任务配置参数
    chunk_size: int = 6000,
    chunk_overlap: int = 200,
    max_concurrency: int = 2,
    rolling_context_max: int = 4000,
    file_encoding: str = "auto",
    output_dir: str = "./output"
):
    """后台处理任务"""
    try:
        config = Config.load()
        config.mode = mode
        # [lslsl3q 添加] 覆盖配置参数
        config.chunk_size = chunk_size
        config.chunk_overlap = chunk_overlap
        config.max_concurrency = max_concurrency
        config.rolling_context_max = rolling_context_max
        config.file_encoding = file_encoding
        config.output_dir = output_dir
        
        state.message = "正在读取文件..."
        text = read_file(file_path, config.file_encoding)
        
        state.message = "正在提取章节..."
        extractor = ChapterExtractor(text)
        marks = extractor.auto_extract(pattern)
        
        if not marks:
            state.status = "error"
            state.error = "未能识别任何章节"
            return
        
        chapters = extractor.split_chapters(marks)
        state.chapters = chapters
        
        state.message = "正在初始化写入器..."
        writer = IndexWriter(book_name, config)
        state.output_dir = writer.index_dir
        
        # 写入目录
        writer.write_toc(marks)
        
        state.message = "正在处理章节..."
        total = len(chapters)
        completed = 0
        
        def on_chapter_done(ch: Chapter, rolling_context: str = ""):
            nonlocal completed
            completed += 1
            writer.write_chapter(ch)
            writer.progress.mark_done(ch.index, rolling_context)
            state.progress = int(completed / total * 80)
            state.message = f"正在处理章节 {completed}/{total}: {ch.title[:20]}..."
        
        if mode == "speed":
            summarizer = SpeedSummarizer(config)
            await summarizer.run(chapters, on_done=lambda ch: on_chapter_done(ch, ""))
        else:
            last_context = writer.progress.get_rolling_context()
            summarizer = DeepSummarizer(config, initial_context=last_context)
            await summarizer.run(chapters, on_done=on_chapter_done)
        
        state.message = "正在生成全书总结..."
        state.progress = 85
        
        # 加载 summaries
        for ch in chapters:
            if not ch.summary:
                from novel_indexer.config import sanitize_filename
                prefix = sanitize_filename(f"{ch.index:03d}-{ch.title}")
                summary_path = os.path.join(writer.index_dir, f"{book_name}-{prefix}-总结.md")
                if os.path.exists(summary_path):
                    with open(summary_path, "r", encoding="utf-8") as f:
                        content = f.read()
                        header = f"# {ch.title} - 章节总结\n\n"
                        if content.startswith(header):
                            content = content[len(header):]
                        ch.summary = content
        
        book_summarizer = BookSummarizer(config)
        book_summary = await book_summarizer.generate(chapters)
        writer.write_book_summary(book_summary)
        
        state.progress = 100
        state.status = "completed"
        state.message = "处理完成！"
        
    except Exception as e:
        state.status = "error"
        state.error = str(e)
        state.message = f"处理失败: {str(e)}"

@app.get("/output/{book_name}")
async def get_output_files(book_name: str):
    """获取输出文件列表"""
    output_dir = Path("output") / f"{book_name}-索引"
    if not output_dir.exists():
        raise HTTPException(status_code=404, detail="输出目录不存在")
    
    files = []
    for f in output_dir.iterdir():
        if f.is_file():
            files.append({
                "name": f.name,
                "size": f.stat().st_size,
                "modified": datetime.fromtimestamp(f.stat().st_mtime).isoformat()
            })
    
    return {"files": sorted(files, key=lambda x: x["name"])}

@app.get("/download/{book_name}/{filename}")
async def download_file(book_name: str, filename: str):
    """下载输出文件"""
    file_path = Path("output") / f"{book_name}-索引" / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="文件不存在")
    return FileResponse(file_path, filename=filename)

# ─────────────────────────────────────────────────────────────
#  [lslsl3q 添加] 文件编辑接口
# ─────────────────────────────────────────────────────────────

@app.get("/file/{book_name}/{filename}")
async def get_file_content(book_name: str, filename: str):
    """[lslsl3q 添加] 获取文件内容用于编辑"""
    file_path = Path("output") / f"{book_name}-索引" / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="文件不存在")
    
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            content = f.read()
        return {
            "filename": filename,
            "book_name": book_name,
            "content": content,
            "size": file_path.stat().st_size,
            "modified": datetime.fromtimestamp(file_path.stat().st_mtime).isoformat()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"读取文件失败: {str(e)}")


class SaveFileRequest(BaseModel):
    """[lslsl3q 添加] 保存文件请求模型"""
    content: str


@app.put("/file/{book_name}/{filename}")
async def save_file_content(book_name: str, filename: str, request: SaveFileRequest):
    """[lslsl3q 添加] 保存编辑后的文件内容"""
    file_path = Path("output") / f"{book_name}-索引" / filename
    
    # 检查文件是否存在，不存在则创建
    parent_dir = file_path.parent
    if not parent_dir.exists():
        raise HTTPException(status_code=404, detail="书籍目录不存在")
    
    try:
        with open(file_path, "w", encoding="utf-8") as f:
            f.write(request.content)
        
        return {
            "success": True,
            "message": "保存成功",
            "size": file_path.stat().st_size,
            "modified": datetime.fromtimestamp(file_path.stat().st_mtime).isoformat()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"保存文件失败: {str(e)}")

# [lslsl3q 添加结束]

@app.post("/reset")
async def reset_state():
    """重置处理状态"""
    state.status = "idle"
    state.progress = 0
    state.message = ""
    state.book_name = ""
    state.output_dir = ""
    state.error = None
    state.chapters = []
    return {"message": "状态已重置"}

# ─────────────────────────────────────────────────────────────
#  [lslsl3q 添加] 书籍管理与断点续传接口
# ─────────────────────────────────────────────────────────────

@app.get("/books")
async def list_books():
    """[lslsl3q 添加] 列出所有已处理的书籍"""
    output_dir = Path("output")
    if not output_dir.exists():
        return {"books": []}
    
    books = []
    for item in output_dir.iterdir():
        if item.is_dir() and item.name.endswith("-索引"):
            book_name = item.name[:-3]  # 去掉 "-索引" 后缀
            progress_file = item / "progress.json"
            
            # 读取进度信息
            progress_info = {"completed": 0, "total": 0, "percent": 0}
            
            # [lslsl3q 修改] 从章节目录文件读取总章节数
            total = 0
            toc_file = item / f"{book_name}-章节目录.md"
            if toc_file.exists():
                try:
                    with open(toc_file, "r", encoding="utf-8") as f:
                        toc_content = f.read()
                    # 统计目录中的章节数（匹配数字开头的行）
                    import re
                    # 匹配格式如 "   1. 标题" 或 "  001. 标题"
                    chapter_matches = re.findall(r'^\s*\d+\.', toc_content, re.M)
                    total = len(chapter_matches)
                except Exception:
                    pass
            
            if progress_file.exists():
                try:
                    with open(progress_file, "r", encoding="utf-8") as f:
                        progress_data = json.load(f)
                        completed = len(progress_data.get("completed", []))
                        
                        # 如果目录文件没找到，用已完成数作为总数（兼容旧数据）
                        if total == 0:
                            total = completed
                        
                        progress_info = {
                            "completed": completed,
                            "total": total,
                            "percent": int(completed / total * 100) if total > 0 else 0
                        }
                except Exception:
                    pass
            # [lslsl3q 修改结束]
            
            # 统计文件数量
            file_count = len(list(item.glob("*.md")))
            
            books.append({
                "name": book_name,
                "path": str(item),
                "file_count": file_count,
                "progress": progress_info,
                "modified": datetime.fromtimestamp(item.stat().st_mtime).isoformat()
            })
    
    return {"books": sorted(books, key=lambda x: x["modified"], reverse=True)}


@app.get("/progress/{book_name}")
async def get_book_progress(book_name: str):
    """[lslsl3q 添加] 获取某本书的断点续传进度详情"""
    output_dir = Path("output") / f"{book_name}-索引"
    progress_file = output_dir / "progress.json"
    
    if not progress_file.exists():
        return {"exists": False, "message": "未找到进度文件"}
    
    try:
        with open(progress_file, "r", encoding="utf-8") as f:
            data = json.load(f)
        
        completed = data.get("completed", [])
        rolling_context = data.get("rolling_context", "")
        mode = data.get("mode", "")
        
        # [lslsl3q 修改] 从章节目录文件读取总章节数
        total = 0
        toc_file = output_dir / f"{book_name}-章节目录.md"
        if toc_file.exists():
            try:
                with open(toc_file, "r", encoding="utf-8") as f:
                    toc_content = f.read()
                import re
                chapter_matches = re.findall(r'^\s*\d+\.', toc_content, re.M)
                total = len(chapter_matches)
            except Exception:
                pass
        
        # 如果目录文件没找到，用已完成数作为总数
        if total == 0:
            total = len(completed)
        # [lslsl3q 修改结束]
        
        return {
            "exists": True,
            "book_name": book_name,
            "completed_chapters": completed,
            "completed_count": len(completed),
            "total": total,
            "percent": int(len(completed) / total * 100) if total > 0 else 0,
            "mode": mode,
            "has_rolling_context": bool(rolling_context)
        }
    except Exception as e:
        return {"exists": False, "error": str(e)}


@app.post("/resume/{book_name}")
async def resume_processing(
    book_name: str,
    background_tasks: BackgroundTasks,
    mode: str = "speed"
):
    """[lslsl3q 添加] 断点续传 - 继续处理未完成的书籍"""
    if state.status == "processing":
        raise HTTPException(status_code=400, detail="已有任务在处理中")
    
    # 查找原始文件
    upload_dir = Path("uploads")
    original_file = None
    for ext in [".txt", ".md"]:
        candidate = upload_dir / f"{book_name}{ext}"
        if candidate.exists():
            original_file = candidate
            break
    
    if not original_file:
        raise HTTPException(status_code=404, detail="未找到原始上传文件，无法续传")
    
    # 检查进度文件
    progress_file = Path("output") / f"{book_name}-索引" / "progress.json"
    if not progress_file.exists():
        raise HTTPException(status_code=404, detail="未找到进度文件，无法续传")
    
    # 重置状态并启动续传任务
    state.status = "processing"
    state.progress = 0
    state.message = "正在恢复处理..."
    state.error = None
    state.book_name = book_name
    
    background_tasks.add_task(
        resume_book_task,
        str(original_file),
        book_name,
        mode
    )
    
    return {"message": "续传已开始", "book_name": book_name}


async def resume_book_task(file_path: str, book_name: str, mode: str):
    """[lslsl3q 添加] 后台续传任务"""
    try:
        config = Config.load()
        config.mode = mode
        
        state.message = "正在读取文件..."
        text = read_file(file_path, config.file_encoding)
        
        state.message = "正在提取章节..."
        extractor = ChapterExtractor(text)
        marks = extractor.auto_extract()
        
        if not marks:
            state.status = "error"
            state.error = "未能识别任何章节"
            return
        
        chapters = extractor.split_chapters(marks)
        
        # 读取已完成的章节
        progress_path = os.path.join(config.output_dir, f"{book_name}-索引", "progress.json")
        with open(progress_path, "r", encoding="utf-8") as f:
            progress_data = json.load(f)
        completed_indices = set(progress_data.get("completed", []))
        
        # 过滤出未完成的章节
        pending_chapters = [ch for ch in chapters if ch.index not in completed_indices]
        
        if not pending_chapters:
            state.status = "completed"
            state.progress = 100
            state.message = "所有章节已完成！"
            return
        
        state.message = f"发现 {len(pending_chapters)} 个未完成章节..."
        
        writer = IndexWriter(book_name, config)
        state.output_dir = writer.index_dir
        
        total = len(chapters)
        completed = len(completed_indices)
        
        def on_chapter_done(ch: Chapter, rolling_context: str = ""):
            nonlocal completed
            completed += 1
            writer.write_chapter(ch)
            writer.progress.mark_done(ch.index, rolling_context)
            state.progress = int(completed / total * 80)
            state.message = f"正在处理章节 {completed}/{total}: {ch.title[:20]}..."
        
        if mode == "speed":
            summarizer = SpeedSummarizer(config)
            await summarizer.run(pending_chapters, on_done=lambda ch: on_chapter_done(ch, ""))
        else:
            last_context = writer.progress.get_rolling_context()
            summarizer = DeepSummarizer(config, initial_context=last_context)
            await summarizer.run(pending_chapters, on_done=on_chapter_done)
        
        state.message = "正在生成全书总结..."
        state.progress = 85
        
        # 重新加载所有章节的总结
        for ch in chapters:
            if not ch.summary:
                from novel_indexer.config import sanitize_filename
                prefix = sanitize_filename(f"{ch.index:03d}-{ch.title}")
                summary_path = os.path.join(writer.index_dir, f"{book_name}-{prefix}-总结.md")
                if os.path.exists(summary_path):
                    with open(summary_path, "r", encoding="utf-8") as f:
                        content = f.read()
                        header = f"# {ch.title} - 章节总结\n\n"
                        if content.startswith(header):
                            content = content[len(header):]
                        ch.summary = content
        
        book_summarizer = BookSummarizer(config)
        book_summary = await book_summarizer.generate(chapters)
        writer.write_book_summary(book_summary)
        
        state.progress = 100
        state.status = "completed"
        state.message = "处理完成！"
        
    except Exception as e:
        state.status = "error"
        state.error = str(e)
        state.message = f"处理失败: {str(e)}"


# ─────────────────────────────────────────────────────────────
#  Prompt 模板管理
# ─────────────────────────────────────────────────────────────

@app.get("/prompts")
async def get_prompts():
    """获取当前 prompt 模板"""
    from novel_indexer import summarizer
    return {
        "chapter_summary": summarizer.PROMPT_CHAPTER_SUMMARY[:200] + "...",
        "book_summary": summarizer.PROMPT_BOOK_SUMMARY[:200] + "..."
    }

# ─────────────────────────────────────────────────────────────
#  [lslsl3q 添加] 配置管理 API
# ─────────────────────────────────────────────────────────────

ENV_FILE = ".env"

# 配置项定义：key -> (env_name, type, default, description, hint)
CONFIG_SCHEMA = {
    # LLM 配置
    "api_key": ("LLM_API_KEY", "str", "", "API Key", "用于调用 LLM 服务的密钥"),
    "base_url": ("LLM_BASE_URL", "str", "https://api.openai.com/v1", "Base URL", "LLM 服务的 API 地址"),
    "model": ("LLM_MODEL", "str", "gpt-4o-mini", "模型名称", "使用的 LLM 模型"),
    "max_context_tokens": ("LLM_MAX_CONTEXT", "int", "128000", "最大上下文", "模型的最大上下文 token 数"),
    "summary_max_tokens": ("SUMMARY_MAX_TOKENS", "int", "2000", "总结最大长度", "单次总结的最大 token 数"),
    "temperature": ("TEMPERATURE", "float", "0.3", "温度", "生成温度，越高越随机"),
    
    # 分块配置
    "chunk_size": ("CHUNK_SIZE", "int", "6000", "分块大小", "每个原文块的最大 token 数"),
    "chunk_overlap": ("CHUNK_OVERLAP", "int", "200", "分块重叠", "相邻块之间的重叠 token 数"),
    
    # 处理配置
    "mode": ("SUMMARY_MODE", "str", "speed", "总结模式", "speed=并发速读，deep=步进精读"),
    "max_concurrency": ("MAX_CONCURRENCY", "int", "5", "并发数", "速读模式下的最大并发请求数"),
    "rolling_context_max": ("ROLLING_CONTEXT_MAX", "int", "4000", "滚动上下文", "精读模式的滚动上下文上限"),
    
    # 文件配置
    "file_encoding": ("FILE_ENCODING", "str", "auto", "文件编码", "auto=自动检测"),
    "output_dir": ("OUTPUT_DIR", "str", "./output", "输出目录", "索引文件的输出目录"),
}

@app.get("/config")
async def get_config():
    """[lslsl3q 添加] 获取当前配置"""
    config = {}
    for key, (env_name, type_name, default, label, hint) in CONFIG_SCHEMA.items():
        value = os.getenv(env_name, default)
        # 类型转换
        if type_name == "int":
            try:
                value = int(value)
            except:
                value = int(default)
        elif type_name == "float":
            try:
                value = float(value)
            except:
                value = float(default)
        config[key] = {
            "value": value,
            "label": label,
            "hint": hint,
            "type": type_name,
            "default": default
        }
    return config

class SaveConfigRequest(BaseModel):
    """[lslsl3q 添加] 保存配置请求"""
    config: dict

@app.post("/config")
async def save_config(request: SaveConfigRequest):
    """[lslsl3q 添加] 保存配置到 .env 文件"""
    try:
        # 读取现有 .env 内容
        env_path = Path(ENV_FILE)
        existing_lines = []
        existing_keys = set()
        
        if env_path.exists():
            with open(env_path, "r", encoding="utf-8") as f:
                existing_lines = f.readlines()
                for line in existing_lines:
                    if "=" in line and not line.strip().startswith("#"):
                        key = line.split("=")[0].strip()
                        existing_keys.add(key)
        
        # 更新或添加配置项
        new_lines = []
        updated_keys = set()
        
        for line in existing_lines:
            if "=" in line and not line.strip().startswith("#"):
                key = line.split("=")[0].strip()
                # 检查是否在配置 schema 中
                found = False
                for config_key, (env_name, _, _, _, _) in CONFIG_SCHEMA.items():
                    if env_name == key and config_key in request.config:
                        new_value = request.config[config_key]
                        new_lines.append(f"{key}={new_value}\n")
                        updated_keys.add(key)
                        found = True
                        break
                if not found:
                    new_lines.append(line)
            else:
                new_lines.append(line)
        
        # 添加新的配置项
        for config_key, (env_name, _, _, _, _) in CONFIG_SCHEMA.items():
            if env_name not in updated_keys and config_key in request.config:
                new_lines.append(f"{env_name}={request.config[config_key]}\n")
        
        # 写入文件
        with open(env_path, "w", encoding="utf-8") as f:
            f.writelines(new_lines)
        
        # 重新加载环境变量
        load_dotenv(override=True)
        
        return {"success": True, "message": "配置已保存"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"保存配置失败: {str(e)}")

# [lslsl3q 添加结束]

# ─────────────────────────────────────────────────────────────
#  [lslsl3q 添加] 运行 main.py 的接口
# ─────────────────────────────────────────────────────────────

import subprocess
import threading

@app.post("/run-main")
async def run_main(
    background_tasks: BackgroundTasks,
    file_path: str,
    book_name: Optional[str] = None,
    mode: str = "speed",
    pattern: Optional[str] = None
):
    """运行 main.py 处理书籍"""
    if state.status == "processing":
        raise HTTPException(status_code=400, detail="已有任务在处理中")
    
    # 重置状态
    state.status = "processing"
    state.progress = 0
    state.message = "正在启动 main.py..."
    state.error = None
    state.main_logs = []
    state.book_name = book_name or Path(file_path).stem
    
    # 启动后台任务
    background_tasks.add_task(
        run_main_task,
        file_path,
        state.book_name,
        mode,
        pattern
    )
    
    return {"message": "main.py 已启动", "book_name": state.book_name}


def run_main_task(file_path: str, book_name: str, mode: str, pattern: Optional[str]):
    """后台运行 main.py - 交互式版本"""
    import sys
    import threading
    
    try:
        # 构建命令 - 不使用 --skip-confirm，允许交互
        cmd = [
            sys.executable,  # python
            "main.py",
            file_path,
            "--name", book_name,
            "--mode", mode
        ]
        
        if pattern:
            cmd.extend(["--pattern", pattern])
        
        state.main_logs.append(f"$ {' '.join(cmd)}\n")
        state.message = "main.py 运行中..."
        
        # 使用 Popen 实时捕获输出，并支持输入
        process = subprocess.Popen(
            cmd,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding='utf-8',
            errors='replace',
            cwd=str(Path(__file__).parent),
            bufsize=1,
            universal_newlines=True
        )
        
        state.main_process = process
        state.waiting_for_input = False
        state.input_prompt = ""
        
        # 实时读取输出的线程
        def read_output():
            import re
            buffer = ""
            while True:
                char = process.stdout.read(1)
                if not char:
                    break
                buffer += char
                
                # 检测是否需要输入（检测提示符）
                # rich 的 Prompt 会输出类似 "请选择操作 [y/r/m/q] (y):" 的内容
                if char in [':', '?', ']']:
                    # 检查是否是输入提示
                    lines = buffer.split('\n')
                    last_line = lines[-1] if lines else ""
                    
                    # 检测常见的输入提示模式
                    if re.search(r'\[.*\].*[:：]$', last_line) or \
                       re.search(r'[请输入选择].*[:：]$', last_line) or \
                       re.search(r'\(.*\)\s*[:：]?$', last_line):
                        state.waiting_for_input = True
                        state.input_prompt = last_line
                        # 过滤 ANSI 转义码
                        clean_line = re.sub(r'\x1b\[[0-9;]*[a-zA-Z]', '', buffer)
                        state.main_logs.append(clean_line)
                        state.message = "等待输入..."
                        buffer = ""
                        continue
                
                # 遇到换行或特定字符时输出
                if char == '\n':
                    clean_line = re.sub(r'\x1b\[[0-9;]*[a-zA-Z]', '', buffer)
                    state.main_logs.append(clean_line)
                    
                    # 更新进度消息
                    if '✓' in clean_line or '完成' in clean_line:
                        state.message = clean_line.strip()
                    elif '错误' in clean_line or '失败' in clean_line:
                        state.message = clean_line.strip()
                    
                    buffer = ""
            
            process.wait()
            
            if process.returncode == 0:
                state.status = "completed"
                state.progress = 100
                state.message = "处理完成！"
                state.main_logs.append("\n✓ 处理成功完成！\n")
            else:
                state.status = "error"
                state.error = f"main.py 退出码: {process.returncode}"
                state.message = f"处理失败: 退出码 {process.returncode}"
                state.main_logs.append(f"\n✗ 处理失败，退出码: {process.returncode}\n")
            
            state.main_process = None
            state.waiting_for_input = False
        
        # 启动读取线程
        output_thread = threading.Thread(target=read_output, daemon=True)
        output_thread.start()
        
    except Exception as e:
        state.status = "error"
        state.error = str(e)
        state.message = f"运行失败: {str(e)}"
        state.main_logs.append(f"\n✗ 错误: {str(e)}\n")
        state.main_process = None


class SendInputRequest(BaseModel):
    """[lslsl3q 添加] 发送输入请求"""
    input_text: str


@app.post("/main-input")
async def send_main_input(request: SendInputRequest):
    """[lslsl3q 添加] 向 main.py 发送用户输入"""
    if not state.main_process or state.main_process.poll() is not None:
        raise HTTPException(status_code=400, detail="没有运行中的进程")
    
    if not state.waiting_for_input:
        raise HTTPException(status_code=400, detail="进程当前不需要输入")
    
    try:
        # 发送输入
        input_line = request.input_text + "\n"
        state.main_process.stdin.write(input_line)
        state.main_process.stdin.flush()
        
        # 记录输入
        state.main_logs.append(f"> {request.input_text}\n")
        state.waiting_for_input = False
        state.input_prompt = ""
        
        return {"success": True, "message": "输入已发送"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"发送输入失败: {str(e)}")


@app.get("/main-logs")
async def get_main_logs():
    """获取 main.py 的输出日志"""
    return {
        "status": state.status,
        "message": state.message,
        "logs": state.main_logs,
        "progress": state.progress,
        "book_name": state.book_name,
        "error": state.error,
        "waiting_for_input": state.waiting_for_input,
        "input_prompt": state.input_prompt
    }


@app.post("/stop-main")
async def stop_main():
    """停止 main.py 进程"""
    if state.main_process and state.main_process.poll() is None:
        state.main_process.terminate()
        state.main_logs.append("\n⚠ 用户中断了处理\n")
        state.status = "idle"
        state.message = "已停止"
        return {"message": "已停止"}
    return {"message": "没有运行中的进程"}

# [lslsl3q 添加结束]

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=3892)
