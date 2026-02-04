import type { Route } from "./+types/generator";
import { useEffect, useMemo, useRef, useState } from "react";
import { requireUser } from "../lib/auth.server";
import { MasonryGrid } from "../components/MasonryGrid";

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

interface UiHint {
  widget: "searchSelect" | "select";
  label?: string;
  dependsOn?: string[];
  searchParam?: string;
  supportsSuggestions?: boolean;
  min?: number;
  max?: number;
  description?: string;
}

interface TemplateMeta {
  id: string;
  name: string;
  description?: string;
  paramsSchema: Record<string, TemplateParamSchema>;
  uiHints?: Record<string, UiHint>;
  defaults?: Record<string, unknown>;
  themeOptions?: Record<string, string>;
  samples?: string[];
}

interface OptionItem {
  id: string;
  label: string;
}

interface OptionsResponse {
  templateId: string;
  options: Record<string, OptionItem[]>;
}

interface PaletteSuggestion {
  backgroundColor: string;
  crayonColors: string[];
  name?: string;
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
  const [modalOpen, setModalOpen] = useState(false);
  const [view, setView] = useState<"browse" | "result">("browse");
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [options, setOptions] = useState<Record<string, OptionItem[]>>({});
  const [optionQueryByKey, setOptionQueryByKey] = useState<Record<string, string>>({});
  const [optionsLoading, setOptionsLoading] = useState<Record<string, boolean>>({});
  const [optionsError, setOptionsError] = useState<string>("");
  const [searchQueryByKey, setSearchQueryByKey] = useState<Record<string, string>>({});
  const [searchingByKey, setSearchingByKey] = useState<Record<string, boolean>>({});
  const [selectedLabelByKey, setSelectedLabelByKey] = useState<Record<string, string>>(
    {}
  );
  const [comboboxOpenByKey, setComboboxOpenByKey] = useState<Record<string, boolean>>(
    {}
  );
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteLoading, setPaletteLoading] = useState(false);
  const [paletteError, setPaletteError] = useState<string>("");
  const [paletteSuggestions, setPaletteSuggestions] = useState<PaletteSuggestion[]>([]);
  const optionsAbortRef = useRef<AbortController | null>(null);
  const optionsRequestSeqRef = useRef(0);

  useEffect(() => {
    setLoadingTemplates(true);
    fetch("/api/prompts")
      .then((res) => res.json())
      .then((data) => {
        if (data?.templates) {
          setTemplates(data.templates);
        }
      })
      .finally(() => {
        setLoadingTemplates(false);
      });
  }, []);

  const selected = useMemo(
    () => templates.find((t) => t.id === selectedId),
    [templates, selectedId]
  );
  const loadingBackdropUrl = selected?.samples?.[0] ?? "";

  function normalizeQuery(value: string) {
    return value
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  function updateParam(key: string, value: unknown) {
    const clearedKeys = selected?.uiHints
      ? Object.entries(selected.uiHints)
          .filter(([, hint]) => hint.dependsOn?.includes(key))
          .map(([paramKey]) => paramKey)
      : [];
    setParams((prev) => {
      const next = { ...prev, [key]: value };
      for (const clearedKey of clearedKeys) {
        next[clearedKey] = "";
      }
      return next;
    });
    if (clearedKeys.length) {
      setSelectedLabelByKey((prev) => {
        const next = { ...prev };
        let changed = false;
        for (const clearedKey of clearedKeys) {
          if (!(clearedKey in next)) continue;
          delete next[clearedKey];
          changed = true;
        }
        return changed ? next : prev;
      });
    }
  }

  function openTemplate(template: TemplateMeta) {
    setSelectedId(template.id);
    setParams(template.defaults ?? {});
    setOptions({});
    setOptionQueryByKey({});
    setOptionsError("");
    setSearchQueryByKey({});
    setSearchingByKey({});
    setSelectedLabelByKey({});
    setComboboxOpenByKey({});
    setPaletteOpen(false);
    setPaletteError("");
    setPaletteSuggestions([]);
    setError("");
    setModalOpen(true);
  }

  useEffect(() => {
    if (!selected?.uiHints) return;
    const handle = window.setTimeout(() => {
      setOptionQueryByKey((prev) => {
        const next = { ...prev };
        for (const [paramKey, hint] of Object.entries(selected.uiHints ?? {})) {
          if (hint.widget !== "searchSelect" || !hint.searchParam) continue;
          next[hint.searchParam] = (searchQueryByKey[paramKey] ?? "").trim();
        }
        return next;
      });
    }, 300);
    return () => window.clearTimeout(handle);
  }, [searchQueryByKey, selected?.uiHints]);

  const optionsQuery = useMemo(() => {
    const paramsForQuery = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (typeof value === "string") {
        paramsForQuery.set(key, value);
      }
    }
    for (const [key, value] of Object.entries(optionQueryByKey)) {
      if (value) {
        paramsForQuery.set(key, value);
      }
    }
    return paramsForQuery.toString();
  }, [params, optionQueryByKey]);

  useEffect(() => {
    if (!selected) return;
    const url = `/api/prompts/${selected.id}/options${
      optionsQuery ? `?${optionsQuery}` : ""
    }`;

    if (optionsAbortRef.current) {
      optionsAbortRef.current.abort();
    }
    const controller = new AbortController();
    optionsAbortRef.current = controller;
    const requestSeq = ++optionsRequestSeqRef.current;

    const handle = window.setTimeout(() => {
      setOptionsLoading({ global: true });
      fetch(url, { signal: controller.signal })
        .then((res) => res.json())
        .then((data: OptionsResponse) => {
          if (!data?.options) return;
          setOptions(data.options);
          setOptionsError("");
          setSearchingByKey((prev) => {
            if (!selected?.uiHints) return {};
            const next = { ...prev };
            for (const [paramKey, hint] of Object.entries(selected.uiHints)) {
              if (hint.widget !== "searchSelect" || !hint.searchParam) continue;
              next[paramKey] = false;
            }
            return next;
          });
          setParams((prev) => {
            let changed = false;
            const next = { ...prev };
            for (const [key, opts] of Object.entries(data.options)) {
              const schema = selected.paramsSchema?.[key];
              if (!schema || schema.type !== "string") continue;
              const current = String(next[key] ?? "");
              const dependsOn = selected.uiHints?.[key]?.dependsOn ?? [];

              if (dependsOn.length) {
                const depsReady = dependsOn.every((depKey) => {
                  const depValue = next[depKey];
                  return typeof depValue === "string"
                    ? depValue.trim().length > 0
                    : Boolean(depValue);
                });
                if (!depsReady) {
                  if (current) {
                    next[key] = "";
                    changed = true;
                  }
                  continue;
                }
                if (key === "naturalElementId" && !current && opts.length > 0) {
                  next[key] = opts[0].id;
                  changed = true;
                  continue;
                }
                if (opts.length > 0 && current && !opts.some((opt) => opt.id === current)) {
                  next[key] = "";
                  changed = true;
                }
                continue;
              }

              if (!opts.length) continue;
              if (!current || !opts.some((opt) => opt.id === current)) {
                next[key] = opts[0].id;
                changed = true;
              }
            }
            return changed ? next : prev;
          });
        })
        .catch((error) => {
          if (error instanceof DOMException && error.name === "AbortError") return;
          setOptions({});
          setOptionsError("No se pudieron cargar opciones.");
        })
        .finally(() => {
          setOptionsLoading({});
          if (requestSeq === optionsRequestSeqRef.current) {
            setSearchingByKey((prev) => {
              if (!Object.keys(prev).length) return prev;
              const next: Record<string, boolean> = {};
              for (const [key, value] of Object.entries(prev)) {
                if (value) next[key] = false;
              }
              return next;
            });
          }
        });
    }, 250);

    return () => {
      window.clearTimeout(handle);
      controller.abort();
    };
  }, [selectedId, selected, optionsQuery]);

  useEffect(() => {
    setSelectedLabelByKey((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const [key, value] of Object.entries(params)) {
        if (typeof value !== "string" || !value) continue;
        const label = options[key]?.find((item) => item.id === value)?.label;
        if (!label || next[key] === label) continue;
        next[key] = label;
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [params, options]);

  const content =
    view === "result" ? (
      <section className="generator-result">
        <div className="generator-result__card">
          <div className="generator-result__media">
            {previewUrl ? (
              <img src={previewUrl} alt="AI result" />
            ) : (
              <div className="tile-card__placeholder">Generando...</div>
            )}
          </div>
          <div className="generator-result__actions">
            <h1>Listo</h1>
            <p className="text-sm text-gray-500">
              Tu tile fue generado. Puedes crear otro o continuar con la edicion.
            </p>
            <div className="generator-result__buttons">
              <button
                className="btn-pill ghost"
                onClick={() => {
                  setView("browse");
                  setResultUrl("");
                  setPreviewUrl("");
                }}
              >
                Generar nueva
              </button>
              <button
                className="btn-pill primary"
                disabled={!resultUrl}
                onClick={() => {
                  if (!resultUrl) return;
                  window.location.href = resultUrl;
                }}
              >
                Continuar
              </button>
            </div>
          </div>
        </div>
      </section>
    ) : (
      <section className="generator-catalog">
        <div className="generator-catalog__header">
          <h1>Generator</h1>
          <p className="text-sm text-gray-500">
            Genera tiles seamless con templates parametrizados.
          </p>
        </div>
        <MasonryGrid>
          {loadingTemplates && templates.length === 0
            ? Array.from({ length: 6 }).map((_, index) => (
                <div key={`template-skeleton-${index}`} className="template-card">
                  <div className="template-card__preview">
                    <div className="template-card__big skeleton-block skeleton-tile" />
                    <div className="template-card__smalls">
                      <div className="template-card__small skeleton-block skeleton-tile" />
                      <div className="template-card__small skeleton-block skeleton-tile" />
                    </div>
                  </div>
                  <div className="template-card__label">
                    <div className="skeleton-line skeleton-line--title" />
                    <div className="skeleton-line skeleton-line--sub" />
                  </div>
                </div>
              ))
            : templates.map((template) => {
                const samples = template.samples ?? [];
                const bigSample = samples[0];
                const smallSamples = [samples[1], samples[2]];
                return (
                  <button
                    key={template.id}
                    className={`template-card tile-card ${
                      template.id === selectedId ? "is-active" : ""
                    }`}
                    onClick={() => openTemplate(template)}
                  >
                    <div className="template-card__preview">
                      <div className="template-card__big">
                        {bigSample ? (
                          <img src={bigSample} alt={template.name} />
                        ) : (
                          <div className="template-card__placeholder">Preview</div>
                        )}
                      </div>
                      <div className="template-card__smalls">
                        {smallSamples.map((sample, index) => (
                          <div
                            key={`${template.id}-small-${index}`}
                            className="template-card__small"
                          >
                            {sample ? (
                              <img src={sample} alt={`${template.name} sample ${index + 2}`} />
                            ) : (
                              <div className="template-card__placeholder">+</div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="template-card__label">
                      <h3>{template.name}</h3>
                      <p>{template.description}</p>
                    </div>
                  </button>
                );
              })}
        </MasonryGrid>
      </section>
    );

  return (
    <main className="page">
      <div className="page__inner">
        {content}
        {modalOpen && selected ? (
          <div className="modal-overlay">
            <div className="modal-card generator-modal">
              <button className="modal-close" onClick={() => setModalOpen(false)}>
                ✕
              </button>
              <div className="generator__section">
                <label>Parametros</label>
                {optionsError ? (
                  <p className="text-xs text-red-500">{optionsError}</p>
                ) : null}
                <div className="generator__fields">
                  {Object.entries(selected.paramsSchema).map(([key, schema]) => {
                    const uiHint = selected.uiHints?.[key];
                    const label = uiHint?.label ?? key;
                    const isReady = uiHint?.dependsOn?.every(
                      (dep) => Boolean(params[dep])
                    ) ?? true;
                    const optionsForKey = options[key] ?? [];
                    if (schema.type === "string" && uiHint?.widget === "searchSelect") {
                      const value = (params[key] as string) ?? "";
                      const searchQuery = searchQueryByKey[key] ?? "";
                      const isSearching = Boolean(optionsLoading.global || searchingByKey[key]);
                      const normalizedQuery = normalizeQuery(searchQuery);
                      const filteredOptions = normalizedQuery.length < 2
                        ? optionsForKey
                        : optionsForKey.filter((option) => {
                            const normalizedLabel = normalizeQuery(option.label);
                            const normalizedId = normalizeQuery(option.id);
                            return (
                              normalizedLabel.includes(normalizedQuery) ||
                              normalizedId.includes(normalizedQuery) ||
                              normalizedLabel
                                .split(" ")
                                .some((token) => token.startsWith(normalizedQuery))
                            );
                          });
                      const selectedLabel =
                        optionsForKey.find((opt) => opt.id === value)?.label ?? "";
                      return (
                        <div key={key} className="generator__field">
                          <span>{label}</span>
                          <div className="search-select">
                            <div className="search-select__control">
                              <input
                                type="text"
                                placeholder="Buscar..."
                                value={
                                  comboboxOpenByKey[key]
                                    ? searchQuery
                                    : value
                                      ? selectedLabel || selectedLabelByKey[key] || searchQuery
                                      : searchQuery
                                }
                                onChange={(event) =>
                                  {
                                    const nextQuery = event.target.value;
                                    setSearchQueryByKey((prev) => ({
                                      ...prev,
                                      [key]: nextQuery,
                                    }));
                                    if (uiHint.searchParam) {
                                      setSearchingByKey((prev) => ({
                                        ...prev,
                                        [key]: true,
                                      }));
                                      setOptions((prev) => ({ ...prev, [key]: [] }));
                                      if (value) {
                                        updateParam(key, "");
                                      }
                                      setSelectedLabelByKey((prev) => {
                                        if (!(key in prev)) return prev;
                                        const next = { ...prev };
                                        delete next[key];
                                        return next;
                                      });
                                    }
                                  }
                                }
                                onFocus={() =>
                                  setComboboxOpenByKey((prev) => ({ ...prev, [key]: true }))
                                }
                                onBlur={() =>
                                  window.setTimeout(() => {
                                    setComboboxOpenByKey((prev) => ({
                                      ...prev,
                                      [key]: false,
                                    }));
                                  }, 120)
                                }
                              />
                              <button
                                type="button"
                                className="search-select__chevron"
                                onClick={() =>
                                  setComboboxOpenByKey((prev) => ({
                                    ...prev,
                                    [key]: !prev[key],
                                  }))
                                }
                                aria-label="Abrir opciones"
                              >
                                ▾
                              </button>
                              {optionsLoading.global ? (
                                <span className="input-spinner" aria-hidden />
                              ) : null}
                            </div>
                            {comboboxOpenByKey[key] ? (
                              <div className="search-select__floating">
                                {isSearching ? (
                                  <div className="search-select__empty">Buscando...</div>
                                ) : filteredOptions.length ? (
                                  filteredOptions.map((option) => (
                                    <button
                                      key={option.id}
                                      type="button"
                                      className={`search-select__option ${
                                        option.id === value ? "is-active" : ""
                                      }`}
                                      onClick={() => {
                                        updateParam(key, option.id);
                                        setSearchQueryByKey((prev) => ({
                                          ...prev,
                                          [key]: option.label,
                                        }));
                                        setSelectedLabelByKey((prev) => ({
                                          ...prev,
                                          [key]: option.label,
                                        }));
                                        setComboboxOpenByKey((prev) => ({
                                          ...prev,
                                          [key]: false,
                                        }));
                                      }}
                                    >
                                      {option.label}
                                    </button>
                                  ))
                                ) : (
                                  <div className="search-select__empty">
                                    {searchQuery ? "Sin resultados" : "Busca para cargar"}
                                  </div>
                                )}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      );
                    }
                    if (schema.type === "string" && uiHint?.widget === "select") {
                      const value =
                        (params[key] as string) ??
                        optionsForKey[0]?.id ??
                        "";
                      const disabled = !isReady || !optionsForKey.length;
                      return (
                        <div key={key} className="generator__field">
                          <span>{label}</span>
                          <select
                            value={value}
                            disabled={disabled}
                            onChange={(event) => updateParam(key, event.target.value)}
                          >
                            {optionsForKey.length ? (
                              optionsForKey.map((option) => (
                                <option key={option.id} value={option.id}>
                                  {option.label}
                                </option>
                              ))
                            ) : (
                              <option value="">
                                {isReady ? "Sin opciones" : "Selecciona un valor previo"}
                              </option>
                            )}
                          </select>
                          {optionsLoading.global ? (
                            <span className="input-spinner input-spinner--select" aria-hidden />
                          ) : null}
                        </div>
                      );
                    }
                    if (schema.enum?.length) {
                      const value = (params[key] as string) ?? schema.enum[0];
                      return (
                        <div key={key} className="generator__field">
                          <span>{label}</span>
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
                          <span>{label}</span>
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
                        <span>{label}</span>
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
              {selected?.uiHints?.backgroundColor?.supportsSuggestions &&
              selected?.uiHints?.crayonColors?.supportsSuggestions ? (
                <div className="generator__section">
                  <div className="generator__palette-header">
                    <label>Sugerencias de paleta</label>
                    <button
                      className="btn-pill ghost"
                      type="button"
                      disabled={paletteLoading}
                      onClick={async () => {
                        setPaletteLoading(true);
                        setPaletteError("");
                        try {
                          const paramsForQuery = new URLSearchParams();
                          const themeId = params.themeId;
                          if (typeof themeId === "string") {
                            paramsForQuery.set("themeId", themeId);
                          }
                          const response = await fetch(
                            `/api/prompts/${selected.id}/palettes?${paramsForQuery.toString()}`
                          );
                          const data = await response.json();
                          const palettes = data?.suggestions?.palettes ?? [];
                          setPaletteSuggestions(palettes);
                          setPaletteOpen(true);
                          if (!palettes.length) {
                            setPaletteError("No hay sugerencias disponibles.");
                          }
                        } catch {
                          setPaletteError("No se pudieron cargar paletas.");
                        } finally {
                          setPaletteLoading(false);
                        }
                      }}
                    >
                      {paletteLoading ? "Buscando..." : "Sugerir paleta"}
                    </button>
                  </div>
                  {paletteError ? (
                    <p className="text-xs text-red-500">{paletteError}</p>
                  ) : null}
                  {paletteOpen ? (
                    <div className="palette-grid">
                      {paletteSuggestions.map((palette, index) => (
                        <button
                          key={`palette-${index}`}
                          className="palette-card"
                          type="button"
                          onClick={() => {
                            updateParam("backgroundColor", palette.backgroundColor);
                            updateParam("crayonColors", palette.crayonColors);
                          }}
                        >
                          <div
                            className="palette-card__bg"
                            style={{ backgroundColor: palette.backgroundColor }}
                          />
                          <div className="palette-card__swatches">
                            {palette.crayonColors.map((color) => (
                              <span
                                key={`${index}-${color}`}
                                style={{ backgroundColor: color }}
                              />
                            ))}
                          </div>
                          {palette.name ? (
                            <span className="palette-card__name">{palette.name}</span>
                          ) : null}
                        </button>
                      ))}
                    </div>
                  ) : null}
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
                    const res = await fetch("/api/render", {
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
                      setView("result");
                      setModalOpen(false);
                    }
                  } finally {
                    setLoading(false);
                  }
                }}
              >
                {loading ? "Generando..." : "Generate"}
              </button>
              {loading ? (
                <div className="generator-loading-overlay" role="status" aria-live="polite">
                  <div
                    className="generator-loading-overlay__bg"
                    style={
                      loadingBackdropUrl
                        ? { backgroundImage: `url(${loadingBackdropUrl})` }
                        : undefined
                    }
                  />
                  <div className="generator-loading-overlay__scrim" />
                  <div className="generator-loading-overlay__content">
                    <div className="generator-loading-overlay__spinner" />
                    <h3>Generando tile</h3>
                    <p>Estamos procesando tu imagen. Te mostramos el resultado en breve.</p>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}
