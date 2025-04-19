from dotenv import load_dotenv
from app.utils.format_message import format_user_message
import lmstudio as lms
import os
from openai import OpenAI
from typing import AsyncGenerator

load_dotenv()


class OpenAIO1Service:
    def __init__(self):
        # This must be the *first* SDK interaction (otherwise the SDK will
        # implicitly attempt to access the default server instance)
        # Initialize client with Docker-specific IP
        # Initialize the model using the client

        self.client = OpenAI(
            base_url="http://host.docker.internal:1234/v1", #Model must be running on localhost:1234
            api_key="not-needed",
        )


    def call_o1_api(
        self,
        system_prompt: str,
        data: dict,
        api_key: str | None = None,
    ) -> AsyncGenerator[str, None]:
        """
        Makes a synchronous call to the local LLM model and returns the response.

        Args:
            system_prompt (str): The instruction/system prompt
            data (dict): Dictionary of variables to format into the user message
            api_key (str | None): Optional custom API key (not used for local model)

        Returns:
            str: Local model's response text
        """
        # Create the user message with the data
        user_message = format_user_message(data)

        # Combine the system prompt and user message
        full_prompt = f"{system_prompt}\n\n{user_message}"

        try:
            print("Making synchronous call to the local LLM model...")
            response = self.client.chat.completions.create(
                model="qwen2.5-coder-14b-instruct",
                messages=[{"role": "user", "content": full_prompt}],
                stream=True
            )
        
            print("Call completed successfully")

            if not response:
                raise ValueError("No response returned from the local model")

            return response.choices[0].message.content

        except Exception as e:
            print(f"Error in local model call: {str(e)}")
            raise

    async def call_o1_api_stream(
        self,
        system_prompt: str,
        data: dict,
        api_key: str | None = None,
    ) -> AsyncGenerator[str, None]:
        """
        Simulates a streaming API call to the local LLM model and yields the responses.

        Args:
            system_prompt (str): The instruction/system prompt
            data (dict): Dictionary of variables to format into the user message
            api_key (str | None): Optional custom API key (not used for local model)

        Yields:
            str: Chunks of the local model's response
        """
        # Use the preformatted message if provided, otherwise format the data
        user_message = data.get("formatted_message") or format_user_message(data)
        full_prompt = f"{system_prompt}\n\n{user_message}"
        print(f"Full prompt: {full_prompt}")

        try:
            print("Making streaming call to the local LLM model...")
            response = self.client.chat.completions.create(
                model="qwen2.5-coder-14b-instruct",
                messages=[{"role": "user", "content": full_prompt}],
                stream=True  # Enable streaming
            )

            # Iterate over the streaming response using a regular for loop
            for chunk in response:
                # print(f"Raw chunk: {chunk}")  # Log the raw chunk
                print(f"Chunk type: {type(chunk)}")
                try:
                    # Access the structured chunk object
                    if hasattr(chunk, "choices") and chunk.choices:
                        delta = chunk.choices[0].delta
                        if hasattr(delta, "content") and delta.content:
                            content = delta.content
                            print(f"Yielding content: {content}")
                            yield content
                        else:
                            print("Empty content in chunk, skipping...")
                    else:
                        print("Invalid chunk structure, skipping...")
                except Exception as e:
                    print(f"Error processing chunk: {str(e)}")
                    continue

        except Exception as e:
            print(f"Error in local model streaming call: {str(e)}")
            raise

    def count_tokens(self, prompt: str) -> int:
        """
        Counts the number of tokens in a prompt.

        Args:
            prompt (str): The prompt to count tokens for

        Returns:
            int: Estimated number of input tokens
        """
        # Token counting is not directly supported by lmstudio, so use a simple word count
        num_tokens = len(prompt.split())
        return num_tokens
