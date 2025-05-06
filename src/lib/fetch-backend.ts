import {
  cacheDiagramAndExplanation,
  getCachedDiagram,
  getCachedExplanation,
} from "~/app/_actions/cache";

interface GenerateApiResponse {
  error?: string;
  diagram?: string;
  explanation?: string;
  token_count?: number;
  requires_api_key?: boolean;
}

interface ModifyApiResponse {
  error?: string;
  diagram?: string;
}

interface CostApiResponse {
  error?: string;
  cost?: string;
}

export async function generateAndCacheDiagram(
  username: string,
  repo: string,
  github_pat?: string,
  instructions?: string,
  api_key?: string,
): Promise<GenerateApiResponse> {
  try {
    const baseUrl =
      process.env.NEXT_PUBLIC_API_DEV_URL ?? "https://api.gitdiagram.com";
    const url = new URL(`${baseUrl}/generate`);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        username,
        repo,
        instructions: instructions ?? "",
        api_key: api_key,
        github_pat: github_pat,
      }),
    });

    if (response.status === 429) {
      return { error: "Rate limit exceeded. Please try again later." };
    }

    const data = (await response.json()) as GenerateApiResponse;

    if (data.error) {
      return data; // pass the whole thing for multiple data fields
    }

    // Call the server action to cache the diagram
    await cacheDiagramAndExplanation(
      username,
      repo,
      data.diagram!,
      data.explanation!,
    );
    return { diagram: data.diagram };
  } catch (error) {
    console.error("Error generating diagram:", error);
    return { error: "Failed to generate diagram. Please try again later." };
  }
}

export async function modifyAndCacheDiagram(
  username: string,
  repo: string,
  instructions: string,
): Promise<ModifyApiResponse> {
  try {
    // First get the current diagram from cache
    const currentDiagram = await getCachedDiagram(username, repo);
    const explanation = await getCachedExplanation(username, repo);

    if (!currentDiagram || !explanation) {
      return { error: "No existing diagram or explanation found to modify" };
    }

    const baseUrl =
      process.env.NEXT_PUBLIC_API_DEV_URL ?? "https://api.gitdiagram.com";
    const url = new URL(`${baseUrl}/modify`);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        username,
        repo,
        instructions: instructions,
        current_diagram: currentDiagram,
        explanation: explanation,
      }),
    });

    if (response.status === 429) {
      return { error: "Rate limit exceeded. Please try again later." };
    }

    const data = (await response.json()) as ModifyApiResponse;

    if (data.error) {
      return { error: data.error };
    }

    // Call the server action to cache the diagram
    await cacheDiagramAndExplanation(
      username,
      repo,
      data.diagram!,
      explanation,
    );
    return { diagram: data.diagram };
  } catch (error) {
    console.error("Error modifying diagram:", error);
    return { error: "Failed to modify diagram. Please try again later." };
  }
}

export async function getCostOfGeneration(
  username: string,
  repo: string,
  instructions: string,
  github_pat?: string,
): Promise<CostApiResponse> {
  try {
    const baseUrl =
      process.env.NEXT_PUBLIC_API_DEV_URL ?? "https://api.gitdiagram.com";
    const url = new URL(`${baseUrl}/generate/cost`);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        username,
        repo,
        github_pat: github_pat,
        instructions: instructions ?? "",
      }),
    });

    if (response.status === 429) {
      return { error: "Rate limit exceeded. Please try again later." };
    }

    const data = (await response.json()) as CostApiResponse;

    return { cost: data.cost, error: data.error };
  } catch (error) {
    console.error("Error getting generation cost:", error);
    return { error: "Failed to get cost estimate." };
  }
}

export async function askQuestion(
  username: string,
  repo: string,
  question: string,
  github_pat?: string,
): Promise<{ answer?: string; error?: string }> {
  try {
    const baseUrl =
      process.env.NEXT_PUBLIC_API_DEV_URL ?? "http://localhost:5432";
    const url = new URL(`${baseUrl}/generate/ask`);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        username,
        repo,
        instructions: question,
        github_pat: github_pat,
      }),
    });

    if (response.status === 429) {
      return { error: "Rate limit exceeded. Please try again later." };
    }

    const data = await response.json();

    if (data.error) {
      return { error: data.error };
    }

    return { answer: data.answer };
  } catch (error) {
    console.error("Error asking question:", error);
    return { error: "Failed to ask question. Please try again later." };
  }
}

export async function generateGherkinScenarios(
  username: string,
  repo: string,
  github_pat?: string,
): Promise<{ gherkin_scenarios?: string; error?: string }> {
  try {
    const baseUrl =
      process.env.NEXT_PUBLIC_API_DEV_URL ?? "http://localhost:5432";
    const url = new URL(`${baseUrl}/generate/gherkin`);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        username,
        repo,
        github_pat: github_pat,
      }),
    });

    if (response.status === 429) {
      return { error: "Rate limit exceeded. Please try again later." };
    }

    const data = await response.json();

    if (data.error) {
      return { error: data.error };
    }

    return { gherkin_scenarios: data.gherkin_scenarios };
  } catch (error) {
    console.error("Error generating Gherkin scenarios:", error);
    return { error: "Failed to generate Gherkin scenarios. Please try again later." };
  }
}
