import { useEffect, useState, type CSSProperties } from "react";
import { m } from "./i18n";
import { Icon } from "./ui";

export const campPlaces = [
  {
    route: "governance",
    name: m("Council"),
    task: m("Governance"),
    description: m(
      "Gather around the fire. Consider proposals and cast your vote.",
    ),
    x: 50,
    y: 47,
    icon: "council",
  },
  {
    route: "treasury",
    name: m("Treasury"),
    task: m("DAO funds"),
    description: m("Explore the shared resources that support our next steps."),
    x: 78,
    y: 29,
    icon: "treasury",
  },
  {
    route: "delegation",
    name: m("Seekers"),
    task: m("Delegation"),
    description: m(
      "Find your voice. Vote yourself or choose a representative.",
    ),
    x: 23,
    y: 30,
    icon: "delegation",
  },
  {
    route: "create",
    name: m("Planning table"),
    task: m("Create proposal"),
    description: m("Put an idea on the table and plan the way forward."),
    x: 23,
    y: 66,
    icon: "planning",
  },
  {
    route: "history",
    name: m("Chronicle"),
    task: m("History"),
    description: m(
      "Read the decisions and transactions recorded along the way.",
    ),
    x: 78,
    y: 67,
    icon: "chronicle",
  },
  {
    route: "ragequit",
    name: m("Departure"),
    task: m("Exit DAO"),
    description: m(
      "Review the terms, burn MANA and receive your eligible share.",
    ),
    x: 50,
    y: 87,
    icon: "ragequit",
  },
] as const;

function useResolvedTheme() {
  const [dark, setDark] = useState(
    document.documentElement.dataset.theme === "dark",
  );
  useEffect(() => {
    const observer = new MutationObserver(() =>
      setDark(document.documentElement.dataset.theme === "dark"),
    );
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, []);
  return dark ? "night" : "day";
}

export function CampMap({
  activeVotes,
  ready,
}: {
  activeVotes?: number;
  ready?: number;
}) {
  const theme = useResolvedTheme();
  const [failed, setFailed] = useState(false);
  return (
    <section className="camp" aria-labelledby="camp-title">
      <div className="camp-intro">
        <div>
          <p className="eyebrow">{m("Mythical DAO · A band of seekers")}</p>
          <h1 id="camp-title">{m("The Seekers’ Camp")}</h1>
          <p>
            {m(
              "Every journey needs a gathering place. Shape our next steps, share a voice and care for the resources we hold together.",
            )}
          </p>
        </div>
        <a className="camp-guide" href="#guide">
          <Icon name="compass" />
          {m("A guide to the camp")} <span aria-hidden="true">↗</span>
        </a>
      </div>
      <div className={"camp-map" + (failed ? " camp-map-fallback" : "")}>
        <picture>
          <source
            media="(max-width: 767px)"
            srcSet={`/camp/${theme}-small.webp`}
          />
          <img
            src={`/camp/${theme}.webp`}
            width="1536"
            height="1024"
            alt=""
            fetchPriority="high"
            onError={() => setFailed(true)}
            onLoad={() => setFailed(false)}
          />
        </picture>
        {failed && (
          <p className="map-fallback-note">
            {m("Choose a place to explore the camp.")}
          </p>
        )}
        <nav className="camp-hotspots" aria-label={m("Camp map")}>
          {campPlaces.map((place, index) => (
            <a
              key={place.route}
              href={`#${place.route}`}
              className={`camp-hotspot hotspot-${place.route}`}
              style={
                { "--x": `${place.x}%`, "--y": `${place.y}%` } as CSSProperties
              }
              aria-label={`${place.name} · ${place.task}`}
            >
              <span className="map-number" aria-hidden="true">
                {index + 1}
              </span>
              <span className="map-label">
                <strong>{place.name}</strong>
                <small>{place.task}</small>
              </span>
              {place.route === "governance" &&
                activeVotes !== undefined &&
                activeVotes > 0 && (
                  <span className="map-count">
                    {m("{count} open votes", { count: activeVotes })}
                  </span>
                )}
            </a>
          ))}
        </nav>
        <span className="map-caption" aria-hidden="true">
          MYTHICAL BEINGS · SEEKERS’ CAMP
        </span>
      </div>
      <nav className="camp-directory" aria-label={m("Camp destinations")}>
        {campPlaces.map((place, index) => (
          <a href={`#${place.route}`} key={place.route}>
            <span className="place-mark">
              <span>{index + 1}</span>
              <Icon name={place.icon} />
            </span>
            <span>
              <strong>
                {place.name}
                <span className="place-task"> · {place.task}</span>
              </strong>
              <small>{place.description}</small>
            </span>
            <span className="place-arrow" aria-hidden="true">
              ↗
            </span>
          </a>
        ))}
      </nav>
      {(ready ?? 0) > 0 && (
        <p className="camp-ready">
          <Icon name="check" />
          <a href="#governance">
            {m("{count} approved decisions await execution at the Council.", {
              count: ready!,
            })}
          </a>
        </p>
      )}
    </section>
  );
}

export function CampBreadcrumb({ route }: { route: string }) {
  const place = campPlaces.find(
    (p) => p.route === (route.startsWith("proposal/") ? "governance" : route),
  );
  return (
    <div className="camp-breadcrumb">
      <a href="#overview">
        <Icon name="compass" />
        {m("Back to camp")}
      </a>
      <span aria-hidden="true">/</span>
      <span className="place-heading">
        <Icon name={place?.icon ?? "info"} />
        {place?.name ?? m("Field guide")}
      </span>
    </div>
  );
}
