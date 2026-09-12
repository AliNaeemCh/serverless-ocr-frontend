import { useEffect, useRef, useState } from "react";
import DOMPurify from "dompurify";
import renderMathInElement from "katex/contrib/auto-render";
import "katex/dist/katex.min.css";
import "./App.css";

const API_URL = import.meta.env.VITE_API_URL;
const WEBSOCKET_URL = import.meta.env.VITE_WEBSOCKET_URL;

// 7.5 MB safe limit for API Gateway direct JSON payloads
const MAX_FILE_SIZE_BYTES = 7.5 * 1024 * 1024;

const GENERIC_ERROR_MSG =
  "An error occurred while processing your request. Please try again.";

// Only log to console in non-production environments
const log = (...args) => {
  if (!import.meta.env.PROD) {
    console.log(...args);
  }
};

export default function App() {
  const inputRef = useRef(null);
  const wsRef = useRef(null);
  const connectionIdRef = useRef(null);
  const previewRef = useRef(null);

  const [file, setFile] = useState(null);
  const [status, setStatus] = useState("idle");
  const [progress, setProgress] = useState(null);
  const [html, setHtml] = useState("");
  const [error, setError] = useState("");

  // State for System Architecture Modal
  const [showArchModal, setShowArchModal] = useState(false);

  // Clean up WebSocket on component unmount
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  // Render sanitized HTML and process LaTeX
  useEffect(() => {
    if (!html || !previewRef.current) return;

    const sanitizedHtml = DOMPurify.sanitize(html, {
      USE_PROFILES: { html: true },
      ADD_ATTR: ["style"],
      ALLOWED_URI_REGEXP:
        /^(?:(?:https?|mailto):|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/i,
    });

    previewRef.current.innerHTML = sanitizedHtml;

    // Render LaTeX expressions inside the generated HTML.
    renderMathInElement(previewRef.current, {
      delimiters: [
        { left: "$$", right: "$$", display: true },
        { left: "\\[", right: "\\]", display: true },
        { left: "\\(", right: "\\)", display: false },
        { left: "$", right: "$", display: false },
      ],
      throwOnError: false,
    });
  }, [html]);

  const selectFile = (selectedFile) => {
    if (!selectedFile) return;

    const allowedTypes = [
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/webp",
    ];

    if (!allowedTypes.includes(selectedFile.type)) {
      setError("Only PDF, JPG, PNG, and WebP files are supported.");
      return;
    }

    if (selectedFile.size > MAX_FILE_SIZE_BYTES) {
      setError("File size exceeds the 7.5 MB limit for direct processing.");
      return;
    }

    setFile(selectedFile);
    setError("");
    setStatus("idle");
    setProgress(null);
    setHtml("");
  };

  const connectAndRegister = () => {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(WEBSOCKET_URL);
      wsRef.current = ws;

      const timeout = setTimeout(() => {
        ws.close();
        reject(new Error(GENERIC_ERROR_MSG));
      }, 10000);

      ws.onopen = () => {
        log("WebSocket connected");

        ws.send(
          JSON.stringify({
            action: "getConnId",
          })
        );
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          log("WebSocket message:", data);

          if (data.type === "connection") {
            clearTimeout(timeout);
            connectionIdRef.current = data.connectionId;
            log("Connection ID:", data.connectionId);
            resolve(data.connectionId);
            return;
          }

          if (data.status === "progress") {
            setProgress(data);
            return;
          }

          if (data.status === "completed") {
            log("Processing completed");
            setStatus("completed");

            if (data.html) {
              setHtml(data.html);
            }

            ws.close();
            return;
          }

          if (data.status === "error") {
            setStatus("error");
            setError(GENERIC_ERROR_MSG);
            ws.close();
          }
        } catch {
          setStatus("error");
          setError(GENERIC_ERROR_MSG);
        }
      };

      ws.onerror = () => {
        clearTimeout(timeout);
        reject(new Error(GENERIC_ERROR_MSG));
      };

      ws.onclose = () => {
        log("WebSocket disconnected");

        if (wsRef.current === ws) {
          wsRef.current = null;
          connectionIdRef.current = null;
        }
      };
    });
  };

  const convert = async () => {
    if (!file) return;

    setStatus("processing");
    setError("");
    setProgress(null);
    setHtml("");

    try {
      const connectionId = await connectAndRegister();
      const base64 = await fileToBase64(file);

      const response = await fetch(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          filename: file.name,
          file: base64,
          connectionId,
        }),
      });

      if (!response.ok) {
        throw new Error(GENERIC_ERROR_MSG);
      }

      const data = await response.json();

      // Immediate backend error
      if (data.status === "error") {
        throw new Error(GENERIC_ERROR_MSG);
      }

      // HTTP completion
      if (data.status === "completed" && data.html) {
        setHtml(data.html);
        setStatus("completed");
        wsRef.current?.close();
      }
    } catch {
      setStatus("error");
      setError(GENERIC_ERROR_MSG);

      wsRef.current?.close();
      wsRef.current = null;
      connectionIdRef.current = null;
    }
  };

  const downloadHtml = () => {
    const blob = new Blob([html], {
      type: "text/html",
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `${file.name.replace(/\.[^/.]+$/, "")}.html`;
    link.click();

    URL.revokeObjectURL(url);
  };

  const reset = () => {
    wsRef.current?.close();
    wsRef.current = null;
    connectionIdRef.current = null;

    setFile(null);
    setStatus("idle");
    setProgress(null);
    setHtml("");
    setError("");

    if (inputRef.current) {
      inputRef.current.value = "";
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <div className="logo-icon">📄</div>

          <div>
            <h1>Document to HTML</h1>
            <p>Convert PDFs and images into structured HTML instantly.</p>
          </div>
        </div>

        <button
          className="arch-button"
          onClick={() => setShowArchModal(true)}
          title="View System Architecture Specs"
        >
          <span className="status-indicator"></span>

          <div className="arch-button-content">
            <strong>System Architecture</strong>
            <span>Serverless Processing Pipeline</span>
          </div>

          <span className="arch-badge-tag">AWS Lambda</span>
        </button>
      </header>

      {showArchModal && (
        <div
          className="modal-overlay"
          onClick={() => setShowArchModal(false)}
        >
          <div
            className="modal-content"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <h2>System Architecture</h2>
                <p>Document & image processing pipeline</p>
              </div>

              <button
                className="modal-close"
                onClick={() => setShowArchModal(false)}
              >
                &times;
              </button>
            </div>

            <div className="modal-body">
              <div className="system-flow">
                <div className="flow-step">
                  <span className="flow-label">Client</span>
                  <strong>React SPA</strong>
                </div>

                <span className="flow-arrow">HTTP POST / WS Stream</span>

                <div className="flow-step">
                  <span className="flow-label">Gateway</span>
                  <strong>API Gateway</strong>
                </div>

                <span className="flow-arrow">→ Event Trigger</span>

                <div className="flow-step">
                  <span className="flow-label">Compute</span>
                  <strong>AWS Lambda</strong>
                </div>

                <span className="flow-arrow">→ Async Requests</span>

                <div className="flow-step">
                  <span className="flow-label">Vision Model</span>
                  <strong>Gemini API</strong>
                </div>
              </div>

              <ul className="arch-spec-list">
                <li>
                  <strong>Dual API Protocols:</strong> Handles document
                  uploads and HTML responses over HTTP, while using a
                  WebSocket connection to stream page-level progress back to
                  the UI.
                </li>

                <li>
                  <strong>Transient File Operations:</strong> Writes incoming
                  uploads to Lambda <code>/tmp</code> storage to render PDF
                  pages via PyMuPDF or stage raw images, without requiring
                  external S3 or database storage.
                </li>

                <li>
                  <strong>Bounded Parallelism:</strong> Sends async page
                  requests to Gemini via <code>httpx</code> worker pools to
                  keep execution within Lambda memory, connection pool, and
                  upstream rate limits.
                </li>

                <li>
                  <strong>Vision-Based Extraction:</strong> Prompts Gemini to
                  preserve document structure, formatting, alignment, tables,
                  and mathematical notation as HTML and LaTeX.
                </li>
              </ul>
            </div>

            <div className="modal-footer">
              <span className="tech-pill">Python 3.14</span>
              <span className="tech-pill">PyMuPDF</span>
              <span className="tech-pill">httpx</span>
              <span className="tech-pill">AWS API Gateway</span>
              <span className="tech-pill">AWS Lambda</span>
              <span className="tech-pill">Gemini Vision</span>
            </div>
          </div>
        </div>
      )}

      <main
        className={`main-container ${
          status === "completed" ? "has-preview" : ""
        }`}
      >
        <section className="card upload-card">
          {!file && (
            <div
              className="dropzone"
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                selectFile(e.dataTransfer.files[0]);
              }}
            >
              <div className="upload-icon">↑</div>

              <strong>Drop your file here</strong>

              <span>
                or <b>browse</b> to choose a file
              </span>

              <small>
                Supported: PDF, JPG, PNG, WebP (Max 7.5 MB)
              </small>

              <input
                ref={inputRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp"
                hidden
                onChange={(e) => selectFile(e.target.files[0])}
              />
            </div>
          )}

          {file && (
            <div className="file-section">
              <div className="file">
                <div className="file-type">
                  {file.type === "application/pdf" ? "PDF" : "IMG"}
                </div>

                <div className="file-info">
                  <strong>{file.name}</strong>
                  <span>{formatSize(file.size)}</span>
                </div>

                {status === "idle" && (
                  <button className="text-btn" onClick={reset}>
                    Remove
                  </button>
                )}
              </div>

              {status === "idle" && (
                <button className="primary" onClick={convert}>
                  Convert to HTML
                </button>
              )}

              {status === "processing" && (
                <div className="progress">
                  <div className="progress-top">
                    <span>
                      {progress
                        ? `Processing page ${progress.page}`
                        : "Processing..."}
                    </span>

                    {progress && <b>{progress.percent}%</b>}
                  </div>

                  <div className="progress-track">
                    <div
                      className="progress-fill"
                      style={{
                        width: `${progress?.percent || 5}%`,
                      }}
                    />
                  </div>

                  {progress && (
                    <small>
                      {progress.completed} of {progress.total} pages completed
                    </small>
                  )}
                </div>
              )}

              {status === "completed" && (
                <div className="completion-controls">
                  <div className="completed">
                    <span>✓</span>
                    Conversion completed
                  </div>

                  <button className="again" onClick={reset}>
                    Convert another file
                  </button>
                </div>
              )}
            </div>
          )}

          {error && <div className="error">{error}</div>}
        </section>

        {status === "completed" && (
          <section className="card preview-card">
            <div className="preview-header">
              <h2>HTML Preview</h2>

              <button className="download" onClick={downloadHtml}>
                Download .html
              </button>
            </div>

            <div className="preview" ref={previewRef} />
          </section>
        )}
      </main>

      <footer className="footer">
        PDF & images → structured HTML
      </footer>
    </div>
  );
}

/* Helper Functions */

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      resolve(reader.result.split(",")[1]);
    };

    reader.onerror = reject;

    reader.readAsDataURL(file);
  });
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;

  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}