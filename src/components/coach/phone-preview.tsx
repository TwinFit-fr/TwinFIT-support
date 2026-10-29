"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Lock, Sparkles } from "lucide-react";
import { useStoredChoice } from "@/hooks/use-stored-choice";
import { cn } from "@/lib/utils";
import { parseMarkdown, type MdBlock, type MdInline } from "@/lib/coach/markdown";
import type { Locale } from "@/lib/coach/types";

/**
 * An approximation of the Android Coach screens, drawn with the app's tokens (TwinFIT-UI
 * `theme/Color.kt`, `Typography.kt`, `Spacing.kt`) so staff see roughly what a user sees. It is
 * not pixel-perfect; it is faithful to what the app renders and, above all, to what it does not.
 */

// ---- Devices -----------------------------------------------------------------------------------

export type PreviewDevice = {
  id: string;
  label: string;
  /** Logical size in dp (1 dp = 1 CSS px here). */
  width: number;
  height: number;
};

export const PREVIEW_DEVICES: readonly PreviewDevice[] = [
  { id: "narrow", label: "Narrow · fold cover 320×820", width: 320, height: 820 },
  { id: "small", label: "Small · 360×760", width: 360, height: 760 },
  { id: "standard", label: "Standard · Pixel 8 412×915", width: 412, height: 915 },
  { id: "large", label: "Large · Pixel 8 Pro 448×998", width: 448, height: 998 },
];

const DEFAULT_DEVICE = "standard";

function parseDevice(raw: unknown): string | null {
  return typeof raw === "string" && PREVIEW_DEVICES.some((d) => d.id === raw) ? raw : null;
}

/** The phone size the preview last used, remembered per browser. */
export function usePreviewDevice() {
  const [id, setId] = useStoredChoice("twinfit.coach.preview.device", DEFAULT_DEVICE, parseDevice);
  const device = PREVIEW_DEVICES.find((d) => d.id === id) ?? PREVIEW_DEVICES[2];
  return [device, setId] as const;
}

// ---- App tokens --------------------------------------------------------------------------------

const app = {
  surface: "#0C1A23",
  card: "#16303D",
  label: "#FFFFFF",
  labelMuted: "rgba(250,250,250,0.70)",
  glass: "rgba(255,255,255,0.05)",
  fieldBorder: "rgba(255,255,255,0.15)",
  accentCyan: "#3BB3D0",
  primary: "#FF4500",
  primaryLight: "#FF8E53",
  font: "Rubik, ui-sans-serif, system-ui, sans-serif",
} as const;

const type = {
  body: { fontSize: 16, lineHeight: "22px", fontWeight: 400 },
  caption: { fontSize: 12, lineHeight: "16px", fontWeight: 300 },
  headline: { fontSize: 17, lineHeight: "22px", fontWeight: 500 },
  titleH3: { fontSize: 20, lineHeight: "26px", fontWeight: 500 },
} as const;

// ---- Markdown as the app draws it --------------------------------------------------------------

export { app as appColors, type as appType };

export function Inlines({ inlines }: { inlines: MdInline[] }) {
  return (
    <>
      {inlines.map((part, index) => {
        switch (part.type) {
          case "text":
            return <span key={index}>{part.value}</span>;
          case "bold":
            return (
              <span key={index} style={{ fontWeight: 700 }}>
                {part.value}
              </span>
            );
          case "italic":
            return (
              <span key={index} style={{ fontStyle: "italic" }}>
                {part.value}
              </span>
            );
          case "code":
            return (
              <span key={index} style={{ fontFamily: "ui-monospace, monospace", background: app.glass }}>
                {part.value}
              </span>
            );
          case "link":
            return (
              <span
                key={index}
                title={part.url}
                style={{ color: app.accentCyan, textDecoration: "underline" }}
              >
                {part.label}
              </span>
            );
        }
      })}
    </>
  );
}

export function ListRow({ marker, indent, children }: { marker: string; indent: number; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", paddingLeft: indent * 16 }}>
      <span style={{ ...type.body, width: 22, flexShrink: 0, color: app.labelMuted }}>{marker}</span>
      <span style={{ ...type.body, color: app.label, whiteSpace: "pre-wrap", minWidth: 0 }}>{children}</span>
    </div>
  );
}

/**
 * Where the preview loads an image from, or null when the app would show it as a link (it is not on
 * the app's Storage). Pending uploads resolve to their local object URL.
 */
export type ResolveImage = (url: string) => string | null;

/**
 * Mirrors `CoachMarkdown.kt`: block gap 8 dp, headings 4 dp above, code in a 12 dp glass field,
 * images full width in a 12 dp field.
 */
export function AppMarkdown({ source, resolveImage }: { source: string; resolveImage?: ResolveImage }) {
  const blocks = parseMarkdown(source);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%" }}>
      {blocks.map((block, index) => (
        <Block key={index} block={block} resolveImage={resolveImage} />
      ))}
    </div>
  );
}

/**
 * Preview-only placement of an image. The app has no alignment syntax and always draws images full
 * width; anything but "full" is a what-if for staff and is never written to `answer_md`.
 */
export type PreviewImageAlign = "full" | "left" | "center" | "right";

/** `MarkdownImage` in the app: a glass placeholder while loading, the alt text if it fails. */
export function AppImage({ src, alt, align = "full" }: { src: string; alt: string; align?: PreviewImageAlign }) {
  const [load, setLoad] = useState<{ src: string; state: "loading" | "loaded" | "failed" }>({ src, state: "loading" });
  const state = load.src === src ? load.state : "loading";
  if (state === "failed") {
    return alt ? <p style={{ ...type.caption, color: app.labelMuted, margin: 0 }}>{alt}</p> : null;
  }
  return (
    <div
      style={{
        width: align === "full" ? "100%" : "60%",
        marginLeft: align === "right" || align === "center" ? "auto" : 0,
        marginRight: align === "left" || align === "center" ? "auto" : 0,
        minHeight: state === "loading" ? 160 : 0,
        borderRadius: 12,
        overflow: "hidden",
        background: state === "loading" ? app.glass : "transparent",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- storage and blob URLs, no optimisation */}
      <img
        src={src}
        alt={alt}
        style={{ display: "block", width: "100%", height: "auto" }}
        onLoad={() => setLoad({ src, state: "loaded" })}
        onError={() => setLoad({ src, state: "failed" })}
      />
    </div>
  );
}

export function Block({
  block,
  resolveImage,
  imageAlign,
}: {
  block: MdBlock;
  resolveImage?: ResolveImage;
  imageAlign?: PreviewImageAlign;
}) {
  switch (block.type) {
    case "image": {
      const src = resolveImage?.(block.url) ?? null;
      if (src) return <AppImage src={src} alt={block.alt} align={imageAlign} />;
      return (
        <p style={{ ...type.body, color: app.label, margin: 0, overflowWrap: "anywhere" }}>
          <Inlines inlines={[{ type: "link", label: block.alt || block.url, url: block.url }]} />
        </p>
      );
    }
    case "paragraph":
      return (
        <p style={{ ...type.body, color: app.label, margin: 0, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
          <Inlines inlines={block.inlines} />
        </p>
      );
    case "heading":
      return (
        <p
          style={{
            ...(block.level === 1 ? type.titleH3 : type.headline),
            color: app.label,
            margin: 0,
            paddingTop: 4,
            whiteSpace: "pre-wrap",
          }}
        >
          <Inlines inlines={block.inlines} />
        </p>
      );
    case "bullet":
      return (
        <ListRow marker="•" indent={block.indent}>
          <Inlines inlines={block.inlines} />
        </ListRow>
      );
    case "numbered":
      return (
        <ListRow marker={`${block.number}.`} indent={0}>
          <Inlines inlines={block.inlines} />
        </ListRow>
      );
    case "code":
      return (
        <pre
          style={{
            ...type.caption,
            fontFamily: "ui-monospace, monospace",
            fontSize: 13,
            fontWeight: 400,
            color: app.label,
            background: app.glass,
            borderRadius: 12,
            padding: 12,
            margin: 0,
            whiteSpace: "pre-wrap",
            overflowWrap: "anywhere",
          }}
        >
          {block.code}
        </pre>
      );
    case "rule":
      return <div style={{ height: 1, background: app.fieldBorder, margin: "4px 0" }} />;
  }
}

// ---- Screens -----------------------------------------------------------------------------------

export type PreviewLessonState = "available" | "seen" | "locked";

export type PreviewLessonRow = {
  slug: string;
  title: string;
  state: PreviewLessonState;
  /** Title of the prerequisite when locked. */
  lockedReasonTitle?: string;
  /** The lesson being edited. */
  current?: boolean;
};

const SHEET_STRINGS: Record<Locale, { title: string; progress: (seen: number, total: number) => string; locked: (title: string) => string }> = {
  en: { title: "Tutorials", progress: (s, t) => `${s} of ${t}`, locked: (t) => `Read “${t}” first` },
  es: { title: "Tutoriales", progress: (s, t) => `${s} de ${t}`, locked: (t) => `Lee “${t}” primero` },
  fr: { title: "Tutoriels", progress: (s, t) => `${s} sur ${t}`, locked: (t) => `Lis « ${t} » d’abord` },
  de: { title: "Tutorials", progress: (s, t) => `${s} von ${t}`, locked: (t) => `Lies zuerst „${t}“` },
};

/** The Tutorials bottom sheet (`CoachLessonsSheet.kt`). */
export function LessonsSheetPreview({ lessons, locale }: { lessons: PreviewLessonRow[]; locale: Locale }) {
  const strings = SHEET_STRINGS[locale];
  const seen = lessons.filter((l) => l.state === "seen").length;
  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100%", justifyContent: "flex-end" }}>
      <div style={{ flex: 1, background: "rgba(0,0,0,0.4)" }} />
      <div
        style={{
          background: app.card,
          borderRadius: "24px 24px 0 0",
          padding: "12px 16px 24px",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ width: 32, height: 4, borderRadius: 4, background: app.fieldBorder, alignSelf: "center", marginBottom: 12 }} />
        <div style={{ ...type.titleH3, color: app.label }}>{strings.title}</div>
        <div style={{ ...type.caption, color: app.labelMuted, paddingTop: 4, paddingBottom: 12 }}>
          {strings.progress(seen, lessons.length)}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 420, overflow: "hidden" }}>
          {lessons.map((lesson) => {
            const locked = lesson.state === "locked";
            const reason = locked && lesson.lockedReasonTitle ? strings.locked(lesson.lockedReasonTitle) : null;
            return (
              <div
                key={lesson.slug}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: 12,
                  borderRadius: 12,
                  outline: lesson.current ? `1px dashed ${app.accentCyan}` : undefined,
                }}
                title={lesson.current ? "The lesson being edited" : undefined}
              >
                <span style={{ width: 20, height: 20, flexShrink: 0, display: "inline-flex" }}>
                  {lesson.state === "seen" && <CheckCircle2 size={20} color={app.primaryLight} strokeWidth={1.75} />}
                  {lesson.state === "locked" && <Lock size={20} color={app.labelMuted} strokeWidth={1.75} />}
                </span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div
                    style={{
                      ...type.body,
                      color: locked ? app.labelMuted : app.label,
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                    }}
                  >
                    {lesson.title}
                  </div>
                  {reason && (
                    <div style={{ ...type.caption, color: app.labelMuted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {reason}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/**
 * A lesson opened from the list: the chip text as the user turn, the answer as Twin's reply.
 * `children` replaces the rendered answer (the chunk editor draws it block by block).
 */
export function LessonChatPreview({
  text,
  answerMd,
  resolveImage,
  children,
}: {
  text: string;
  answerMd: string;
  resolveImage?: ResolveImage;
  children?: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: "16px 24px 24px" }}>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <div
          style={{
            ...type.body,
            color: app.label,
            background: app.card,
            borderRadius: "20px 20px 6px 20px",
            padding: "12px 16px",
            maxWidth: "85%",
            whiteSpace: "pre-wrap",
            overflowWrap: "anywhere",
          }}
        >
          {text || " "}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              width: 24,
              height: 24,
              borderRadius: 12,
              background: "rgba(255,69,0,0.16)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Sparkles size={14} color={app.primaryLight} />
          </span>
          <span style={{ ...type.caption, color: app.labelMuted }}>Twin</span>
        </div>
        {children ? (
          children
        ) : answerMd.trim() ? (
          <AppMarkdown source={answerMd} resolveImage={resolveImage} />
        ) : (
          <p style={{ ...type.caption, color: app.labelMuted, margin: 0, fontStyle: "italic" }}>
            No answer_md: the app sends the chip text to the Coach instead.
          </p>
        )}
      </div>
    </div>
  );
}

/** A prompt chip in the empty state (`CoachSectionPrompts.kt` look-alike). */
export function ChipPreview({ text }: { text: string }) {
  return (
    <div style={{ padding: "24px 24px", display: "flex", flexWrap: "wrap", gap: 8 }}>
      <span
        style={{
          ...type.body,
          fontSize: 15,
          lineHeight: "20px",
          color: app.label,
          border: `1px solid ${app.fieldBorder}`,
          background: app.glass,
          borderRadius: 999,
          padding: "10px 16px",
          maxWidth: "100%",
          overflowWrap: "anywhere",
        }}
      >
        {text || " "}
      </span>
    </div>
  );
}

// ---- Frame -------------------------------------------------------------------------------------

/**
 * A phone-shaped frame at `device` size, scaled down to fit its container. Children scroll inside
 * the screen like the app's content would.
 */
export function PhoneFrame({
  device,
  children,
  onDropFiles,
}: {
  device: PreviewDevice;
  children: React.ReactNode;
  /** Files dropped anywhere on the screen (images for the answer). */
  onDropFiles?: (files: File[]) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const bezel = 12;
  const frameWidth = device.width + bezel * 2;
  const frameHeight = device.height + bezel * 2;

  const measure = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const next = Math.min(1, el.clientWidth / frameWidth, el.clientHeight / frameHeight);
    setScale(Number.isFinite(next) && next > 0 ? next : 1);
  }, [frameWidth, frameHeight]);

  useEffect(() => {
    measure();
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [measure]);

  return (
    <div ref={containerRef} className="relative flex h-full min-h-0 w-full items-start justify-center overflow-hidden">
      {/* The app's typeface, loaded only while a preview is on screen. */}
      <style>{`@import url("https://fonts.googleapis.com/css2?family=Rubik:ital,wght@0,300..700;1,300..700&display=swap");`}</style>
      <div
        style={{
          width: frameWidth,
          height: frameHeight,
          transform: `scale(${scale})`,
          transformOrigin: "top center",
          flexShrink: 0,
        }}
      >
        <div
          className={cn(
            "relative h-full w-full rounded-[40px] border border-zinc-700 bg-zinc-900 shadow-xl",
            dragging && "ring-2 ring-amber-400",
          )}
          style={{ padding: bezel }}
          aria-label={`Phone preview, ${device.label}`}
          onDragOver={(event) => {
            if (onDropFiles && Array.from(event.dataTransfer.types).includes("Files")) {
              event.preventDefault();
              setDragging(true);
            }
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            setDragging(false);
            if (!onDropFiles) return;
            const files = Array.from(event.dataTransfer.files ?? []);
            if (files.length === 0) return;
            event.preventDefault();
            onDropFiles(files);
          }}
        >
          <div
            className="h-full w-full overflow-y-auto overflow-x-hidden rounded-[30px]"
            style={{ background: app.surface, fontFamily: app.font, color: app.label }}
          >
            <div style={{ height: 24 }} aria-hidden />
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
