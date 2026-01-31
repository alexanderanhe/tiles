import type { Route } from "./+types/upload";
import { useEffect, useMemo, useState } from "react";
import { useLoaderData, useNavigate } from "react-router";
import { redirect } from "react-router";
import { requireUser } from "../lib/auth.server";
import { initServer } from "../lib/init.server";

export async function loader({ request }: Route.LoaderArgs) {
  await initServer();
  const user = await requireUser(request);
  return { user };
}

export default function Upload() {
  useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const [files, setFiles] = useState<File[]>([]);
  const [status, setStatus] = useState("");
  const [step, setStep] = useState<"idle" | "create" | "sign" | "upload" | "finalize" | "done">("idle");
  const [dragActive, setDragActive] = useState(false);
  const [completedTiles, setCompletedTiles] = useState<string[]>([]);
  const [replaceExisting, setReplaceExisting] = useState(true);

  const previewUrls = useMemo(() => files.map((file) => URL.createObjectURL(file)), [files]);

  useEffect(() => {
    return () => {
      for (const url of previewUrls) URL.revokeObjectURL(url);
    };
  }, [previewUrls]);

  useEffect(() => {
    function onDragOver(event: DragEvent) {
      if (!event.dataTransfer?.types?.includes("Files")) return;
      event.preventDefault();
      setDragActive(true);
    }
    function onDragLeave(event: DragEvent) {
      if ((event.target as HTMLElement)?.classList?.contains("drag-overlay")) {
        setDragActive(false);
      }
    }
    function onDrop(event: DragEvent) {
      event.preventDefault();
      setDragActive(false);
      const dropped = Array.from(event.dataTransfer?.files ?? []).slice(0, 10);
      if (dropped.length) setFiles(dropped);
    }
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("drop", onDrop);
    window.addEventListener("dragleave", onDragLeave);
    return () => {
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("drop", onDrop);
      window.removeEventListener("dragleave", onDragLeave);
    };
  }, []);

  async function uploadToR2(uploadUrl: string, file: File) {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 90_000);
    try {
      return await fetch(uploadUrl, {
        method: "PUT",
        headers: { "content-type": file.type || "application/octet-stream" },
        body: file,
        signal: controller.signal,
      });
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  async function hashFile(file: File) {
    const buffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  return (
    <main className="page">
      <div className="page__inner">
        <section className="upload-card">
          <div className="upload-card__header">
            <div>
              <h1>Subir imagen</h1>
              <p>Publica un tile y genera preview con watermark.</p>
            </div>
            <div className="upload-card__steps">
              <span className={step === "create" ? "is-active" : ""}>1 Crear</span>
              <span className={step === "sign" ? "is-active" : ""}>2 Firmar</span>
              <span className={step === "upload" ? "is-active" : ""}>3 Subir</span>
              <span className={step === "finalize" ? "is-active" : ""}>4 Preview</span>
              <span className={step === "done" ? "is-active" : ""}>5 Listo</span>
            </div>
          </div>

          <form
            className="upload-grid"
            onSubmit={async (event) => {
              event.preventDefault();
              if (!files.length) {
                setStatus("Selecciona un archivo.");
                return;
              }
              const uploadedIds: string[] = [];
              for (const file of files) {
                setStep("create");
                setStatus(`Creando tile (${file.name})...`);
                const contentHash = await hashFile(file);
                const createRes = await fetch("/api/tiles", {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({
                    title: prettyTitleFromFilename(file.name),
                    description: "",
                    tags: [],
                    visibility: "private",
                    seamless: true,
                    format: file.type.split("/")[1],
                    contentHash,
                    replaceExisting,
                  }),
                });
                if (createRes.status === 409) {
                  const duplicate = await createRes.json().catch(() => null);
                  setStatus(`Imagen duplicada. Ya existe (${file.name}).`);
                  if (duplicate?.tileId) {
                    uploadedIds.push(duplicate.tileId);
                  }
                  continue;
                }
                if (!createRes.ok) {
                  setStatus(`No se pudo crear el tile (${file.name}).`);
                  setStep("idle");
                  return;
                }
                const created = await createRes.json();
                const tileId = created?.tile?._id;
                if (!tileId) {
                  setStatus(`No se recibió el tileId (${file.name}).`);
                  setStep("idle");
                  return;
                }

                setStep("sign");
                setStatus(`Firmando upload (${file.name})...`);
                const signRes = await fetch("/api/r2/sign-upload", {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({
                    tileId,
                    kind: "master",
                    contentType: file.type,
                  }),
                });
                if (!signRes.ok) {
                  setStatus(`No se pudo firmar el upload (${file.name}).`);
                  setStep("idle");
                  return;
                }
                const signData = await signRes.json();
                const uploadUrl = signData?.uploadUrl;
                if (!uploadUrl) {
                  setStatus(`No se recibió la URL de upload (${file.name}).`);
                  setStep("idle");
                  return;
                }

                setStep("upload");
                setStatus(`Subiendo a R2 (${file.name})...`);
                try {
                  const uploadRes = await uploadToR2(uploadUrl, file);
                  if (!uploadRes.ok) {
                    setStatus(`Error al subir a R2 (${file.name}).`);
                    setStep("idle");
                    return;
                  }
                } catch (error) {
                  const message =
                    error instanceof DOMException && error.name === "AbortError"
                      ? "Timeout al subir. Revisa CORS de R2 o tu conexion."
                      : "No se pudo subir a R2. Revisa CORS y el bucket.";
                  setStatus(`${message} (${file.name}).`);
                  setStep("idle");
                  return;
                }

                setStep("finalize");
                setStatus(`Generando preview (${file.name})...`);
                const finalizeRes = await fetch(`/api/tiles/${tileId}/finalize`, {
                  method: "POST",
                });
                if (!finalizeRes.ok) {
                  setStatus(`No se pudo finalizar (${file.name}).`);
                  setStep("idle");
                  return;
                }

                uploadedIds.push(tileId);
              }

              setStep("done");
              setStatus(`Listo! ${files.length} archivo(s) subidos.`);
              setCompletedTiles(uploadedIds);
              const firstTileId = uploadedIds[0];
              if (firstTileId) {
                navigate(`/tiles/${firstTileId}`);
              }
            }}
          >
            <div className="upload-fields">
              <div className="upload-helper">
                Se suben como privados. Podras editar titulo, descripcion y tags despues.
              </div>
              <label className="upload-toggle">
                <input
                  type="checkbox"
                  checked={replaceExisting}
                  onChange={(event) => setReplaceExisting(event.target.checked)}
                />
                Reemplazar si ya existe en mi cuenta
              </label>
            </div>

            <div className="upload-media">
              <div className="upload-media__row">
                <label className="btn-secondary" htmlFor="file-input">
                  Seleccionar imagenes
                </label>
                <span className="upload-media__note">Hasta 10 archivos.</span>
              </div>
              <input
                id="file-input"
                className="upload-input"
                type="file"
                accept="image/*"
                multiple
                onChange={(event) =>
                  setFiles(Array.from(event.target.files ?? []).slice(0, 10))
                }
              />
              {previewUrls.length ? (
                <div className="upload-preview">
                  <div className="upload-preview__grid">
                    {previewUrls.map((url, index) => (
                      <img key={`${url}-${index}`} src={url} alt={`Preview ${index + 1}`} />
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            <button className="btn-primary" type="submit">
              Subir ahora (privado)
            </button>
          </form>

          {status ? <p className="upload-status">{status}</p> : null}
        </section>
        {dragActive ? (
          <div className="drag-overlay" onDragLeave={() => setDragActive(false)}>
            <div className="drag-overlay__card">Suelta aqui</div>
          </div>
        ) : null}
      </div>
    </main>
  );
}
  function prettyTitleFromFilename(filename: string) {
    return filename
      .replace(/\.[^/.]+$/, "")
      .replace(/[-_]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }
