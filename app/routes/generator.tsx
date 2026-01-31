import type { Route } from "./+types/generator";
import { useEffect, useMemo, useState } from "react";
import { requireUser } from "../lib/auth.server";

interface TemplateParamSchema {
  type: "string" | "array";
  min?: number;
  max?: number;
  regex?: string;
  enum?: string[];
  minItems?: number;
  maxItems?: number;
  items?: { type: "string"; regex?: string };
}

interface TemplateMeta {
  id: string;
  name: string;
  description?: string;
  paramsSchema: Record<string, TemplateParamSchema>;
  defaults?: Record<string, unknown>;
  themeOptions?: Record<string, string>;
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireUser(request);
  return {};
}

function isHexColor(schema?: TemplateParamSchema) {
  const regex = schema?.regex ?? schema?.items?.regex;
  return regex?.includes("#([0-9a-fA-F]{6})") ?? false;
}

function normalizeHexInput(value: string) {
  const trimmed = value.trim();
  if (/^#([0-9a-fA-F]{6})$/.test(trimmed)) return trimmed;
  if (/^#([0-9a-fA-F]{3})$/.test(trimmed)) {
    return (
      "#" +
      trimmed[1] +
      trimmed[1] +
      trimmed[2] +
      trimmed[2] +
      trimmed[3] +
      trimmed[3]
    );
  }
  return "#000000";
}

export default function Generator() {
  const [templates, setTemplates] = useState<TemplateMeta[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [params, setParams] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(false);
  const [resultUrl, setResultUrl] = useState<string>("");
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const [error, setError] = useState<string>("");

  useEffect(() => {
    fetch("/api/templates")
      .then((res) => res.json())
      .then((data) => {
        if (data?.templates) {
          setTemplates(data.templates);
          if (data.templates[0]) {
            setSelectedId(data.templates[0].id);
            setParams(data.templates[0].defaults ?? {});
          }
        }
      });
  }, []);

  const selected = useMemo(
    () => templates.find((t) => t.id === selectedId),
    [templates, selectedId]
  );

  function updateParam(key: string, value: unknown) {
    setParams((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <main className="page">
      <div className="page__inner">
        <section className="generator">
          <div className="generator__panel">
            <h1>Generator</h1>
            <p className="text-sm text-gray-500">
              Genera tiles seamless con templates parametrizados.
            </p>

            <div className="generator__section">
              <label>Template</label>
              <div className="generator__template-grid">
                {templates.map((template) => (
                  <button
                    key={template.id}
                    className={`template-card ${
                      template.id === selectedId ? "is-active" : ""
                    }`}
                    onClick={() => {
                      setSelectedId(template.id);
                      setParams(template.defaults ?? {});
                    }}
                  >
                    <h3>{template.name}</h3>
                    <p>{template.description}</p>
                  </button>
                ))}
              </div>
            </div>

            {selected ? (
              <div className="generator__section">
                <label>Parametros</label>
                <div className="generator__fields">
                  {Object.entries(selected.paramsSchema).map(([key, schema]) => {
                    if (schema.enum?.length) {
                      const value = (params[key] as string) ?? schema.enum[0];
                      return (
                        <div key={key} className="generator__field">
                          <span>{key}</span>
                          <select
                            value={value}
                            onChange={(event) => updateParam(key, event.target.value)}
                          >
                            {schema.enum.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                        </div>
                      );
                    }
                    if (schema.type === "array") {
                      const value = (params[key] as string[]) ?? [];
                      return (
                        <div key={key} className="generator__field">
                          <span>{key}</span>
                          <div className="generator__chips">
                            {value.map((item, index) => (
                              <div key={`${key}-${index}`} className="color-input">
                                {isHexColor(schema) ? (
                                  <>
                                    <input
                                      type="color"
                                      value={normalizeHexInput(item)}
                                      onChange={(event) => {
                                        const next = [...value];
                                        next[index] = event.target.value;
                                        updateParam(key, next);
                                      }}
                                    />
                                    <input
                                      type="text"
                                      value={item}
                                      onChange={(event) => {
                                        const next = [...value];
                                        next[index] = event.target.value;
                                        updateParam(key, next);
                                      }}
                                    />
                                  </>
                                ) : (
                                  <input
                                    type="text"
                                    value={item}
                                    onChange={(event) => {
                                      const next = [...value];
                                      next[index] = event.target.value;
                                      updateParam(key, next);
                                    }}
                                  />
                                )}
                              </div>
                            ))}
                            <button
                              className="btn-pill ghost"
                              onClick={() => updateParam(key, [...value, "#000000"])}
                            >
                              +
                            </button>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div key={key} className="generator__field">
                        <span>{key}</span>
                        {isHexColor(schema) ? (
                          <div className="color-input">
                            <input
                              type="color"
                              value={normalizeHexInput((params[key] as string) ?? "")}
                              onChange={(event) => updateParam(key, event.target.value)}
                            />
                            <input
                              type="text"
                              maxLength={schema.max}
                              value={(params[key] as string) ?? ""}
                              onChange={(event) => updateParam(key, event.target.value)}
                            />
                          </div>
                        ) : (
                          <input
                            type="text"
                            maxLength={schema.max}
                            value={(params[key] as string) ?? ""}
                            onChange={(event) => updateParam(key, event.target.value)}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {error ? <p className="text-red-500 text-sm">{error}</p> : null}

            <button
              className="btn-pill primary"
              disabled={loading}
              onClick={async () => {
                setLoading(true);
                setError("");
                setResultUrl("");
                setPreviewUrl("");
                try {
                  const res = await fetch("/api/ai/generate", {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ templateId: selectedId, params }),
                  });
                  const data = await res.json();
                  if (!res.ok) {
                    setError(data?.error ?? "Failed to generate");
                  } else {
                    setResultUrl(data?.detailUrl ?? "");
                    setPreviewUrl(data?.previewUrl ?? "");
                  }
                } finally {
                  setLoading(false);
                }
              }}
            >
              {loading ? "Generando..." : "Generate"}
            </button>
          </div>

          <div className="generator__preview">
            <div className="generator__preview-card">
              {previewUrl ? (
                <div className="generator__preview-inner">
                  <img src={previewUrl} alt="AI result" />
                  {resultUrl ? (
                    <a className="btn-pill" href={resultUrl}>
                      Ver detalle
                    </a>
                  ) : null}
                </div>
              ) : (
                <p className="text-sm text-gray-500">El resultado aparecera aqui.</p>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
