"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import { askQuestion } from "~/lib/fetch-backend";
import { Textarea } from "~/components/ui/textarea";
import Loading from "~/components/loading";
import { useDiagram } from "~/hooks/useDiagram";
import MermaidChart from "~/components/mermaid-diagram";
import { ApiKeyButton } from "~/components/api-key-button";

export default function Repo() {
  const [zoomingEnabled, setZoomingEnabled] = useState(false);
  const params = useParams<{ username: string; repo: string }>();

  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [localLoading, setLocalLoading] = useState<boolean>(false);

  // const {
  //   diagram,
  //   error,
  //   loading,
  //   lastGenerated,
  //   cost,
  //   showApiKeyDialog,
  //   handleModify,
  //   handleRegenerate,
  //   handleCopy,
  //   handleApiKeySubmit,
  //   handleCloseApiKeyDialog,
  //   handleOpenApiKeyDialog,
  //   handleExportImage,
  //   state,
  // } = useDiagram(params.username.toLowerCase(), params.repo.toLowerCase());

  const handleAsk = async () => {
    setAnswer(null);
    setLocalError(null);
    setLocalLoading(true);

    try {
      if (!params.username || !params.repo) {
        setLocalError("Invalid repository or username.");
        return;
      }

      const result = await askQuestion(params.username, params.repo, question);
      console.log("Result:", result); // Log the result for debugging

      if (result.error) {
        setLocalError(result.error);
      } else {
        setAnswer(result.answer || "No answer received.");
      }
    } catch (err) {
      console.error("Error:", err);
      setLocalError("An unexpected error occurred.");
    } finally {
      setLocalLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center p-4">
      <div className="flex w-full max-w-4xl flex-col items-center gap-4 px-4">
        <Textarea
          placeholder="Ask a question about the repository..."
          className="w-full"
          rows={4}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
        />

        <button
          className="btn"
          onClick={handleAsk}
          disabled={localLoading || !question.trim()}
        >
          {localLoading ? "Asking..." : "Ask"}
        </button>
        {localError && <p className="text-red-500 mt-2">{localError}</p>}
        {answer && <p className="text-green-500 mt-2">Answer: {answer}</p>}
      </div>

      {/* <div className="mt-8 flex w-full flex-col items-center gap-8">
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
      </div> */}
    </div>
  );
}
