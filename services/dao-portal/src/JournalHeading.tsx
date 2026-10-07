import type { ReactNode } from "react";
export const chapterArt = {
  haechi: { width: 709, height: 682, name: "Haechi", print: true },
  grootslang: { width: 709, height: 678, name: "Grootslang", print: true },
  companions: { width: 709, height: 681, name: "Wati-kutjara", print: true },
  tulpar: { width: 709, height: 682, name: "Tulpar", print: true },
  shahmaran: { width: 709, height: 683, name: "Şahmaran", print: true },
  sumanga: { width: 480, height: 480, name: "Sumangâ", print: false },
  map: { width: 1536, height: 1024, name: "The expedition map", print: false },
  bahana: { width: 500, height: 382, name: "Bahana", print: false },
  "golden-fronds": {
    width: 720,
    height: 416,
    name: "Golden fronds",
    print: false,
  },
} as const;
export type ChapterArt = keyof typeof chapterArt;
export function JournalHeading({
  chapter,
  title,
  description,
  art,
  children,
}: {
  chapter: string;
  title: string;
  description?: ReactNode;
  art: ChapterArt;
  children?: ReactNode;
}) {
  const scene = {
    haechi: "council",
    bahana: "council",
    grootslang: "treasury",
    companions: "companions",
    tulpar: "tulpar",
    shahmaran: "shahmaran",
    sumanga: "sumanga",
    map: "shahmaran",
    "golden-fronds": "treasury",
  }[art];
  return (
    <header className={`chapter-heading chapter-${art}`}>
      <div className="chapter-copy">
        <p className="journal-kicker">{chapter}</p>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
        {children}
      </div>
      <figure className="chapter-figure organic-art">
        <img
          className="chapter-art"
          src={`/journal/organic/${scene}-960.webp`}
          srcSet={`/journal/organic/${scene}-480.webp 480w, /journal/organic/${scene}-960.webp 960w`}
          sizes="(max-width: 767px) 160px, 420px"
          width={960}
          height={640}
          alt=""
        />
      </figure>
    </header>
  );
}
