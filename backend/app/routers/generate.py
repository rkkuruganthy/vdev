from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
from app.services.github_service import GitHubService
from app.services.o1_mini_openai_service import OpenAIO1Service  # Updated import
from app.prompts import (
    SYSTEM_FIRST_PROMPT,
    SYSTEM_SECOND_PROMPT,
    SYSTEM_THIRD_PROMPT,
    ADDITIONAL_SYSTEM_INSTRUCTIONS_PROMPT,
)
from pydantic import BaseModel
from functools import lru_cache
import re
import json
import asyncio

load_dotenv()

router = APIRouter(prefix="/generate", tags=["Local LLM"])

# Initialize services
o1_service = OpenAIO1Service()  # Use the updated OpenAIO1Service


# Cache GitHub data to avoid double API calls from cost and generate
@lru_cache(maxsize=100)
def get_cached_github_data(username: str, repo: str, github_pat: str | None = None):
    # Create a new service instance for each call with the appropriate PAT
    current_github_service = GitHubService(pat=github_pat)

    default_branch = current_github_service.get_default_branch(username, repo)
    if not default_branch:
        default_branch = "main"  # fallback value

    file_tree = current_github_service.get_github_file_paths_as_list(username, repo)
    readme = current_github_service.get_github_readme(username, repo)

    return {"default_branch": default_branch, "file_tree": file_tree, "readme": readme}


class ApiRequest(BaseModel):
    username: str
    repo: str
    instructions: str = ""
    api_key: str | None = None
    github_pat: str | None = None


def process_click_events(diagram: str, username: str, repo: str, branch: str) -> str:
    """
    Process click events in Mermaid diagram to include full GitHub URLs.
    Detects if path is file or directory and uses appropriate URL format.
    """

    def replace_path(match):
        # Extract the path from the click event
        path = match.group(2).strip("\"'")

        # Determine if path is likely a file (has extension) or directory
        is_file = "." in path.split("/")[-1]

        # Construct GitHub URL
        base_url = f"https://github.com/{username}/{repo}"
        path_type = "blob" if is_file else "tree"
        full_url = f"{base_url}/{path_type}/{branch}/{path}"

        # Return the full click event with the new URL
        return f'click {match.group(1)} "{full_url}"'

    # Match click events: click ComponentName "path/to/something"
    click_pattern = r'click ([^\s"]+)\s+"([^"]+)"'
    return re.sub(click_pattern, replace_path, diagram)



@router.post("/stream")
async def generate_stream(request: Request, body: ApiRequest):
    try:
        # Initial validation checks
        if len(body.instructions) > 1000:
            return {"error": "Instructions exceed maximum length of 1000 characters"}

        if body.repo in [
            "fastapi",
            "streamlit",
            "flask",
            "api-analytics",
            "monkeytype",
        ]:
            return {"error": "Example repos cannot be regenerated"}

        async def event_generator():
            try:
                # Get cached GitHub data
                github_data = get_cached_github_data(
                    body.username, body.repo, body.github_pat
                )
                default_branch = github_data["default_branch"]
                file_tree = github_data["file_tree"]
                readme = github_data["readme"]

                # Send initial status
                yield f"data: {json.dumps({'status': 'started', 'message': 'Starting generation process...'})}\n\n"
                await asyncio.sleep(0.1)

                # Token count check
                combined_content = f"{file_tree}\n{readme}"
                token_count = o1_service.count_tokens(combined_content)  # Updated to use o1_service

                if 50000 < token_count < 195000 and not body.api_key:
                    yield f"data: {json.dumps({'error': f'File tree and README combined exceeds token limit (50,000). Current size: {token_count} tokens. This GitHub repository is too large for my wallet, but you can continue by providing your own API key.'})}\n\n"
                    return
                elif token_count > 195000:
                    yield f"data: {json.dumps({'error': f'Repository is too large (>195k tokens) for analysis. Local LLM\'s max context length is 200k tokens. Current size: {token_count} tokens.'})}\n\n"
                    return

                # Prepare prompts
                first_system_prompt = SYSTEM_FIRST_PROMPT
                third_system_prompt = SYSTEM_THIRD_PROMPT
                if body.instructions:
                    first_system_prompt = (
                        first_system_prompt
                        + "\n"
                        + ADDITIONAL_SYSTEM_INSTRUCTIONS_PROMPT
                    )
                    third_system_prompt = (
                        third_system_prompt
                        + "\n"
                        + ADDITIONAL_SYSTEM_INSTRUCTIONS_PROMPT
                    )

                # Phase 1: Get explanation
                yield f"data: {json.dumps({'status': 'explanation_sent', 'message': 'Sending explanation request to local LLM...'})}\n\n"
                await asyncio.sleep(0.1)
                yield f"data: {json.dumps({'status': 'explanation', 'message': 'Analyzing repository structure...'})}\n\n"
                explanation = ""
                async for chunk in o1_service.call_o1_api_stream(  # Updated to use o1_service
                    system_prompt=first_system_prompt,
                    data={
                        "file_tree": file_tree,
                        "readme": readme,
                        "instructions": body.instructions,
                    },
                ):
                    explanation += chunk
                    yield f"data: {json.dumps({'status': 'explanation_chunk', 'chunk': chunk})}\n\n"

                if "BAD_INSTRUCTIONS" in explanation:
                    yield f"data: {json.dumps({'error': 'Invalid or unclear instructions provided'})}\n\n"
                    return

                # Phase 2: Get component mapping
                yield f"data: {json.dumps({'status': 'mapping_sent', 'message': 'Sending component mapping request to local LLM...'})}\n\n"
                await asyncio.sleep(0.1)
                yield f"data: {json.dumps({'status': 'mapping', 'message': 'Creating component mapping...'})}\n\n"
                full_second_response = ""
                async for chunk in o1_service.call_o1_api_stream(  # Updated to use o1_service
                    system_prompt=SYSTEM_SECOND_PROMPT,
                    data={"explanation": explanation, "file_tree": file_tree},
                ):
                    full_second_response += chunk
                    yield f"data: {json.dumps({'status': 'mapping_chunk', 'chunk': chunk})}\n\n"

                # Extract component mapping
                start_tag = "<component_mapping>"
                end_tag = "</component_mapping>"
                component_mapping_text = full_second_response[
                    full_second_response.find(start_tag) : full_second_response.find(
                        end_tag
                    )
                ]

                # Phase 3: Generate Mermaid diagram
                yield f"data: {json.dumps({'status': 'diagram_sent', 'message': 'Sending diagram generation request to local LLM...'})}\n\n"
                await asyncio.sleep(0.1)
                yield f"data: {json.dumps({'status': 'diagram', 'message': 'Generating diagram...'})}\n\n"
                mermaid_code = ""
                async for chunk in o1_service.call_o1_api_stream(  # Updated to use o1_service
                    system_prompt=third_system_prompt,
                    data={
                        "explanation": explanation,
                        "component_mapping": component_mapping_text,
                        "instructions": body.instructions,
                    },
                ):
                    mermaid_code += chunk
                    yield f"data: {json.dumps({'status': 'diagram_chunk', 'chunk': chunk})}\n\n"

                # Process final diagram
                mermaid_code = mermaid_code.replace("```mermaid", "").replace("```", "")
                if "BAD_INSTRUCTIONS" in mermaid_code:
                    yield f"data: {json.dumps({'error': 'Invalid or unclear instructions provided'})}\n\n"
                    return

                processed_diagram = process_click_events(
                    mermaid_code, body.username, body.repo, default_branch
                )

                # Send final result
                yield f"data: {json.dumps({
                    'status': 'complete',
                    'diagram': processed_diagram,
                    'explanation': explanation,
                    'mapping': component_mapping_text
                })}\n\n"

            except Exception as e:
                yield f"data: {json.dumps({'error': str(e)})}\n\n"

        return StreamingResponse(
            event_generator(),
            media_type="text/event-stream",
            headers={
                "X-Accel-Buffering": "no",  # Hint to Nginx
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
            },
        )
    except Exception as e:
        return {"error": str(e)}


@router.post("/ask")
async def ask_question(request: Request, body: ApiRequest):
    try:
        # Get cached GitHub data
        github_data = get_cached_github_data(
            body.username, body.repo, body.github_pat
        )
        file_tree = github_data["file_tree"]
        readme = github_data["readme"]

        # Combine the file tree and README for context
        context = f"File Tree:\n{file_tree}\n\nREADME:\n{readme}"

        print(f"Context:\n{context}")

        # Prepare the data dictionary
        data = {"question": body.instructions, "context": context}

        # Format the user message
        formatted_message = format_user_message(data)
        print(f"Formatted Message:\n{formatted_message}")

        # Call the local LLM
        response = ""
        async for chunk in o1_service.call_o1_api_stream(
            system_prompt="Answer the question based on the provided context.",
            data={"formatted_message": formatted_message},  # Pass the formatted message
        ):
            chunk_str = str(chunk)  # Ensure the chunk is a string
            print(f"Chunk received in /ask endpoint: {chunk_str}")  # Log each chunk
            response += chunk_str
            print(f"Updated response: {response}")  # Log the updated response

        print(f"Final Response:\n{response}")    
        # Return the response
        return {"answer": response}

    except Exception as e:
        return {"error": str(e)}


def format_user_message(data: dict) -> str:
    question = data.get("question", "")
    context = data.get("context", "")
    return f"Question: {question}\n\nContext: {context}"
