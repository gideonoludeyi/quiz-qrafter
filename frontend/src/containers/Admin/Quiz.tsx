import React, { useState, useCallback, useEffect } from "react";
import { useQuizAPI } from "../../services/quiz/context";
import { useDocumentAPI } from "../../services/document/context";
import MarkdownEditor from "react-markdown-editor-lite";
import "react-markdown-editor-lite/lib/index.css";
import markdownIt from "markdown-it";
import { toast } from "sonner";
import { RiUploadLine, RiDownloadLine } from "@remixicon/react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

const mdParser = markdownIt(/* Markdown-it options */);

const Quiz = () => {
  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState("");
  const { upload, loading: uploadLoading, error: uploadError } = useDocumentAPI();
  const { markdown, generateMD, generatePDF, loading: pdfLoading, error: pdfError } = useQuizAPI();
  const [editableMarkdown, setEditableMarkdown] = useState(markdown ?? "");

  const handleFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files ? event.target.files[0] : null;
    setFile(selectedFile);
    setFileName(selectedFile ? selectedFile.name : "");
  }, []);

  const handleUpload = useCallback(async () => {
    if (file) {
      try {
        await upload(file);
        toast.success("File uploaded successfully!");
        await generateMD(fileName);
      } catch (err) {
        const error = err as Error;
        toast.error(`Failed to upload file: ${error.message}`);
      }
    } else {
      toast.error("Please select a file to upload.");
    }
  }, [file, fileName, upload, generateMD]);

  const handleDownloadPDF = useCallback(async () => {
    if (fileName) {
      console.log({ fileName });
      await generatePDF(fileName);
    } else {
      toast.error("Please select a file first.");
    }
  }, [fileName, generatePDF]);

  useEffect(() => {
    setEditableMarkdown(markdown ?? "");
  }, [markdown, setEditableMarkdown]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <label
          className={buttonVariants({
            variant: "outline",
            className:
              "max-w-xs cursor-pointer has-disabled:pointer-events-none has-disabled:opacity-50",
          })}
        >
          <input
            type="file"
            onChange={handleFileChange}
            className="sr-only"
            disabled={uploadLoading || pdfLoading}
            accept=".pdf,.docx,.txt,image/*"
          />
          {uploadLoading || pdfLoading ? <Spinner /> : null}
          <span className="truncate">{fileName || "Choose File"}</span>
        </label>
        <Button onClick={handleUpload} disabled={uploadLoading || !file}>
          <RiUploadLine data-icon="inline-start" />
          Upload
        </Button>
        <Button
          variant="secondary"
          onClick={handleDownloadPDF}
          disabled={pdfLoading || !editableMarkdown}
        >
          <RiDownloadLine data-icon="inline-start" />
          Download PDF
        </Button>
      </div>
      <div className="overflow-hidden rounded-lg border">
        <MarkdownEditor
          value={editableMarkdown}
          style={{ height: "500px", width: "100%", border: "none" }}
          renderHTML={(text) => mdParser.render(text)}
          onChange={({ text }) => setEditableMarkdown(text)}
        />
      </div>
      {uploadError && (
        <p className="text-sm text-destructive">Upload Error: {uploadError.message}</p>
      )}
      {pdfError && <p className="text-sm text-destructive">PDF Error: {pdfError.message}</p>}
      <p className="text-sm text-muted-foreground">Note: PDF uploads must be 15 pages or less.</p>
    </div>
  );
};

export default Quiz;
