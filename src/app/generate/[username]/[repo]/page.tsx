"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import { useDiagram } from "~/hooks/useDiagram";
import MermaidChart from "~/components/mermaid-diagram";
import Loading from "~/components/loading";
import { ApiKeyButton } from "~/components/api-key-button";
import MainCard from "~/components/main-card";
import { useStarReminder } from "~/hooks/useStarReminder";
import { Button } from "~/components/ui/button";
import { generateGherkinScenarios } from "~/lib/fetch-backend";

export default function GenerateRepo() {
  const [zoomingEnabled, setZoomingEnabled] = useState(false);
  const [gherkinResponse, setGherkinResponse] = useState<string | null>(null);
  const [gherkinLoading, setGherkinLoading] = useState(false);
  const params = useParams<{ username: string; repo: string }>();

  // Use the star reminder hook
  useStarReminder();

  const {
    diagram,
    error,
    loading,
    lastGenerated,
    cost,
    showApiKeyDialog,
    handleModify,
    handleRegenerate,
    handleCopy,
    handleApiKeySubmit,
    handleCloseApiKeyDialog,
    handleOpenApiKeyDialog,
    handleExportImage,
    state,
  } = useDiagram(params.username.toLowerCase(), params.repo.toLowerCase());

  // Handler for calling the /gherkin endpoint
  const handleGenerateGherkin = async () => {
    try {
      setGherkinLoading(true);
      setGherkinResponse(null);

      // Call the fetch-backend method
      const result = await generateGherkinScenarios(
        params.username,
        params.repo,
      );

      if (result.error) {
        throw new Error(result.error);
      }

      // Sanitize the Gherkin response
      const sanitizedResponse = result.gherkin_scenarios
        ?.replace(/^```gherkin\s*/, "") // Remove ```gherkin at the beginning
        .replace(/```$/, ""); // Remove ``` at the end

      setGherkinResponse(sanitizedResponse ?? null);
    } catch (err) {
      console.error("Error generating Gherkin scenarios:", err);
      setGherkinResponse("Failed to generate Gherkin scenarios.");
    } finally {
      setGherkinLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center p-4">
      <div className="flex w-full justify-center pt-8">
        <MainCard
          isHome={false}
          username={params.username.toLowerCase()}
          repo={params.repo.toLowerCase()}
          showCustomization={!loading && !error}
          onModify={handleModify}
          onRegenerate={handleRegenerate}
          onCopy={handleCopy}
          lastGenerated={lastGenerated}
          onExportImage={handleExportImage}
          zoomingEnabled={zoomingEnabled}
          onZoomToggle={() => setZoomingEnabled(!zoomingEnabled)}
          loading={loading}
        />
      </div>
      <div className="mt-8 flex w-full flex-col items-center gap-8">
        {loading ? (
          <Loading
            cost={cost}
            status={state.status}
            explanation={state.explanation}
            mapping={state.mapping}
            diagram={state.diagram}
          />
        ) : error || state.error ? (
          <div className="mt-12 text-center">
            <p className="max-w-4xl text-lg font-medium text-purple-600">
              {error || state.error}
            </p>
            {(error?.includes("API key") ||
              state.error?.includes("API key")) && (
              <div className="mt-8 flex flex-col items-center gap-2">
                <ApiKeyButton onClick={handleOpenApiKeyDialog} />
              </div>
            )}
          </div>
        ) : (
          <div className="flex w-full justify-center px-4">
            <MermaidChart chart={diagram} zoomingEnabled={zoomingEnabled} />
          </div>
        )}

        <Button onClick={handleGenerateGherkin} disabled={gherkinLoading} className="border-[3px] border-black bg-purple-400 p-4 px-4 text-base text-black shadow-[4px_4px_0_0_#000000] transition-transform hover:-translate-x-0.5 hover:-translate-y-0.5 hover:transform hover:bg-purple-400 sm:p-6 sm:px-6 sm:text-lg">
          {gherkinLoading ? "Generating Gherkin..." : "Generate Gherkin"}
        </Button>

        {gherkinResponse && (
          <div className="mt-4 w-full max-w-4xl p-4 border rounded-lg bg-gray-100 border-[3px] border-black">
            <h3 className="text-lg font-bold">Generated Gherkin Scenarios:</h3>
            <pre className="mt-2 whitespace-pre-wrap">{gherkinResponse}</pre>
          </div>
        )}
      </div>
    </div>
  );
}