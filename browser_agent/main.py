"""
JobRadar Auto-Apply Agent
=========================
FastAPI service that uses Browser Use + Gemini 2.0 Flash to automatically
apply for jobs on behalf of the user.

Deploy on Render free tier. Keep alive with UptimeRobot (free) pinging
/health every 5 minutes so the service never sleeps.

Endpoints:
  GET  /health          — liveness check (UptimeRobot pings this)
  POST /apply           — start an apply task (non-blocking, streams via SSE)
  GET  /apply/{task_id} — SSE stream of live status updates
  GET  /apply/{task_id}/result — final result after completion
"""

import asyncio
import json
import os
import uuid
from contextlib import asynccontextmanager
from datetime import datetime
from typing import AsyncGenerator

import httpx
from browser_use import Agent
from browser_use.browser import Browser, BrowserConfig
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from langchain_google_genai import ChatGoogleGenerativeAI
from pydantic import BaseModel

load_dotenv()

# ── In-memory task store (fine for single-user personal tool) ─────────────────
tasks: dict[str, dict] = {}

# ── Lifespan ──────────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Install playwright browsers on startup if not already present
    os.system("playwright install chromium --with-deps 2>/dev/null || true")
    yield

app = FastAPI(title="JobRadar Apply Agent", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Restrict to your Vercel URL in production
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Request model ─────────────────────────────────────────────────────────────

class ApplyRequest(BaseModel):
    match_id: str
    job_url: str
    job_title: str
    company: str | None = None

    # Resume
    resume_pdf_url: str          # Public Supabase Storage URL
    resume_text: str             # Plain text fallback for text fields

    # Cover letter (optional)
    cover_letter: str | None = None

    # Application profile — all the pre-filled answers
    full_name: str
    email: str
    phone: str | None = None
    city: str | None = None
    country: str = "India"
    linkedin_url: str | None = None
    github_url: str | None = None
    portfolio_url: str | None = None
    current_title: str | None = None
    years_experience: int | None = None
    expected_ctc: str | None = None
    notice_period: str = "30 days"
    willing_to_relocate: bool = False
    relocation_cities: str | None = None
    work_auth_country: str = "India"
    authorized_to_work: bool = True
    require_sponsorship: bool = False
    gender: str | None = None
    veteran_status: str = "No"
    disability_status: str = "No"
    answer_about_yourself: str | None = None
    answer_why_leave: str | None = None
    answer_strengths: str | None = None
    answer_weaknesses: str | None = None
    answer_salary_expectation: str | None = None

    # Callback: JobRadar will update match status when done
    jobradar_callback_url: str | None = None
    jobradar_api_secret: str | None = None

# ── Health ────────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"ok": True, "time": datetime.utcnow().isoformat()}

# ── Start apply task ──────────────────────────────────────────────────────────

@app.post("/apply")
async def start_apply(req: ApplyRequest):
    task_id = str(uuid.uuid4())
    tasks[task_id] = {
        "id": task_id,
        "match_id": req.match_id,
        "status": "queued",
        "logs": [],
        "result": None,
        "error": None,
        "started_at": datetime.utcnow().isoformat(),
        "finished_at": None,
    }
    # Run agent in background — don't await here
    asyncio.create_task(_run_apply(task_id, req))
    return {"task_id": task_id, "status": "queued"}

# ── SSE live log stream ───────────────────────────────────────────────────────

@app.get("/apply/{task_id}")
async def stream_apply(task_id: str):
    if task_id not in tasks:
        raise HTTPException(status_code=404, detail="Task not found")

    async def event_generator() -> AsyncGenerator[str, None]:
        last_sent = 0
        while True:
            task = tasks.get(task_id, {})
            logs = task.get("logs", [])

            # Send any new log lines
            for log in logs[last_sent:]:
                yield f"data: {json.dumps({'type': 'log', 'message': log})}\n\n"
                last_sent += 1

            # Send status updates
            status = task.get("status", "unknown")
            if status in ("done", "failed"):
                yield f"data: {json.dumps({'type': 'status', 'status': status, 'result': task.get('result'), 'error': task.get('error')})}\n\n"
                break

            await asyncio.sleep(0.8)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )

# ── Get final result ──────────────────────────────────────────────────────────

@app.get("/apply/{task_id}/result")
async def get_result(task_id: str):
    if task_id not in tasks:
        raise HTTPException(status_code=404, detail="Task not found")
    return tasks[task_id]

# ── Core apply logic ──────────────────────────────────────────────────────────

def _log(task_id: str, message: str):
    """Append a log line to the task and print to stdout."""
    print(f"[{task_id[:8]}] {message}")
    tasks[task_id]["logs"].append(message)


async def _run_apply(task_id: str, req: ApplyRequest):
    tasks[task_id]["status"] = "running"
    _log(task_id, f"🚀 Starting application for: {req.job_title} at {req.company or 'company'}")
    _log(task_id, f"🌐 Target URL: {req.job_url}")

    try:
        gemini_key = os.getenv("GEMINI_API_KEY")
        if not gemini_key:
            raise ValueError("GEMINI_API_KEY not set in environment")

        # Build the LLM
        llm = ChatGoogleGenerativeAI(
            model="gemini-2.0-flash",
            google_api_key=gemini_key,
            temperature=0.2,
        )

        # Build context string with all candidate info
        candidate_context = _build_candidate_context(req)

        # Build the agent task prompt
        task_prompt = f"""
You are applying for a job on behalf of a candidate. Here are your instructions:

JOB DETAILS:
- Title: {req.job_title}
- Company: {req.company or 'the company'}
- Application URL: {req.job_url}

YOUR GOAL:
1. Navigate to the job URL above.
2. If it redirects to an Adzuna/job board search page, find the ORIGINAL company career page link and navigate there instead.
3. Find the job application form or "Apply" button.
4. Fill in ALL required fields using the candidate information below.
5. Upload the resume PDF from this URL: {req.resume_pdf_url}
   (If file upload is required and you cannot access the URL, skip file upload and note it in the log)
6. If there is a cover letter field AND one is provided, paste it in.
7. Answer any custom questions using the candidate's information below.
8. Click Submit / Apply to complete the application.
9. Confirm submission was successful (look for a confirmation message or page).

IMPORTANT RULES:
- If a field asks for something not in the candidate info, use reasonable defaults or skip it.
- Do NOT create accounts or sign up for anything — skip steps that require account creation unless there's a "Apply without account" or "Quick Apply" option.
- Do NOT accept cookies or marketing emails.
- If you encounter a CAPTCHA you cannot solve, stop and report it.
- Be honest — do not fill in information that contradicts the candidate profile.

CANDIDATE INFORMATION:
{candidate_context}

{f'COVER LETTER:{chr(10)}{req.cover_letter}' if req.cover_letter else 'No cover letter provided — skip cover letter fields.'}
"""

        _log(task_id, "🤖 Initialising Gemini 2.0 Flash agent...")

        # Configure browser (headless for server, visible locally for debugging)
        headless = os.getenv("BROWSER_HEADLESS", "true").lower() == "true"

        # Create agent — minimal config, let browser-use handle defaults
        agent = Agent(
            task=task_prompt,
            llm=llm,
            browser=Browser(
                config=BrowserConfig(
                    headless=headless,
                    extra_chromium_args=[
                        "--no-sandbox",
                        "--disable-setuid-sandbox",
                        "--disable-dev-shm-usage",
                        "--disable-gpu",
                    ],
                )
            ),
        )

        _log(task_id, "🌍 Opening browser and running agent...")

        # Run agent
        result = await agent.run(max_steps=50)

        # Check if application was successful
        final_result = result.final_result() if hasattr(result, 'final_result') else str(result)
        success = _check_success(final_result)

        if success:
            _log(task_id, "🎉 Application submitted successfully!")
            tasks[task_id]["status"] = "done"
            tasks[task_id]["result"] = final_result
        else:
            _log(task_id, f"⚠️  Agent finished but success unclear. Result: {str(final_result)[:200]}")
            tasks[task_id]["status"] = "done"
            tasks[task_id]["result"] = str(final_result)

        # Notify JobRadar to update match status
        await _notify_jobradar(task_id, req, success, final_result)

    except Exception as e:
        error_msg = str(e)
        _log(task_id, f"❌ Error: {error_msg}")
        tasks[task_id]["status"] = "failed"
        tasks[task_id]["error"] = error_msg
        await _notify_jobradar(task_id, req, False, None, error_msg)

    finally:
        tasks[task_id]["finished_at"] = datetime.utcnow().isoformat()


def _build_candidate_context(req: ApplyRequest) -> str:
    lines = [
        f"Full Name: {req.full_name}",
        f"Email: {req.email}",
    ]
    if req.phone: lines.append(f"Phone: {req.phone}")
    if req.city: lines.append(f"City: {req.city}")
    lines.append(f"Country: {req.country}")
    if req.linkedin_url: lines.append(f"LinkedIn: {req.linkedin_url}")
    if req.github_url: lines.append(f"GitHub: {req.github_url}")
    if req.portfolio_url: lines.append(f"Portfolio: {req.portfolio_url}")
    if req.current_title: lines.append(f"Current Job Title: {req.current_title}")
    if req.years_experience: lines.append(f"Years of Experience: {req.years_experience}")
    if req.expected_ctc: lines.append(f"Expected CTC / Salary: {req.expected_ctc}")
    lines.append(f"Notice Period: {req.notice_period}")
    lines.append(f"Authorized to work in: {req.work_auth_country} — {'Yes' if req.authorized_to_work else 'No'}")
    lines.append(f"Requires Visa Sponsorship: {'Yes' if req.require_sponsorship else 'No'}")
    lines.append(f"Willing to Relocate: {'Yes' if req.willing_to_relocate else 'No'}")
    if req.willing_to_relocate and req.relocation_cities:
        lines.append(f"Preferred Relocation Cities: {req.relocation_cities}")
    if req.gender: lines.append(f"Gender: {req.gender}")
    lines.append(f"Veteran Status: {req.veteran_status}")
    lines.append(f"Disability Status: {req.disability_status}")
    if req.answer_about_yourself:
        lines.append(f"\nAbout Me: {req.answer_about_yourself}")
    if req.answer_why_leave:
        lines.append(f"Why Leaving Current Role: {req.answer_why_leave}")
    if req.answer_strengths:
        lines.append(f"Key Strengths: {req.answer_strengths}")
    if req.answer_weaknesses:
        lines.append(f"Weakness: {req.answer_weaknesses}")
    if req.answer_salary_expectation:
        lines.append(f"Salary Expectation Answer: {req.answer_salary_expectation}")
    return "\n".join(lines)


def _summarise_action(step) -> str:
    """Extract a human-readable summary from a completed step."""
    try:
        actions = step.model_output.action if hasattr(step, 'model_output') else []
        if actions:
            action = actions[0] if isinstance(actions, list) else actions
            action_type = type(action).__name__
            if 'click' in action_type.lower():
                return f"Clicked element"
            if 'fill' in action_type.lower() or 'input' in action_type.lower() or 'type' in action_type.lower():
                return "Filled form field"
            if 'upload' in action_type.lower():
                return "Uploaded file"
            if 'navigate' in action_type.lower() or 'go_to' in action_type.lower():
                return "Navigated to page"
            return action_type
    except Exception:
        pass
    return "Action completed"


def _check_success(result: str) -> bool:
    """Heuristic check if the application was submitted successfully."""
    if not result:
        return False
    result_lower = result.lower()
    success_signals = [
        'submitted', 'application sent', 'applied successfully', 'thank you',
        'we received', 'confirmation', 'application complete', 'successfully applied',
        'your application', 'we will review',
    ]
    failure_signals = [
        'error', 'failed', 'could not', 'unable to', 'captcha', 'login required',
        'sign in required', 'account required',
    ]
    has_success = any(s in result_lower for s in success_signals)
    has_failure = any(s in result_lower for s in failure_signals)
    return has_success and not has_failure


async def _notify_jobradar(
    task_id: str,
    req: ApplyRequest,
    success: bool,
    result: str | None,
    error: str | None = None,
):
    """POST back to JobRadar to update the match status and apply log."""
    if not req.jobradar_callback_url:
        return
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            await client.post(
                req.jobradar_callback_url,
                json={
                    "task_id": task_id,
                    "match_id": req.match_id,
                    "success": success,
                    "result": result,
                    "error": error,
                    "logs": tasks[task_id].get("logs", []),
                },
                headers={
                    "x-api-secret": req.jobradar_api_secret or "",
                    "content-type": "application/json",
                },
            )
    except Exception as e:
        print(f"Callback failed: {e}")
