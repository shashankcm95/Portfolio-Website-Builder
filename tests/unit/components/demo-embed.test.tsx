import { fireEvent, render, screen } from "@testing-library/react";
import { DemoEmbed } from "@/components/projects/demo-embed";
import type { ResolvedDemo } from "@/lib/demos/types";

function demo(partial: Partial<ResolvedDemo>): ResolvedDemo {
  return {
    id: "d",
    url: "https://example.com/x",
    type: "image",
    title: null,
    order: 0,
    embedUrl: null,
    isEmbeddable: true,
    ...partial,
  };
}

describe("<DemoEmbed />", () => {
  it("renders an iframe for YouTube with sandbox + lazy loading", () => {
    render(
      <DemoEmbed
        demo={demo({
          type: "youtube",
          url: "https://youtube.com/watch?v=x",
          embedUrl: "https://www.youtube.com/embed/x",
        })}
      />
    );
    const iframe = screen.getByTestId("demo-embed-iframe").querySelector("iframe");
    expect(iframe).not.toBeNull();
    expect(iframe).toHaveAttribute("src", "https://www.youtube.com/embed/x");
    expect(iframe).toHaveAttribute(
      "sandbox",
      "allow-scripts allow-same-origin allow-presentation"
    );
    expect(iframe).toHaveAttribute("loading", "lazy");
    expect(iframe).toHaveAttribute(
      "referrerPolicy",
      "strict-origin-when-cross-origin"
    );
  });

  it("downgrades iframe types to outbound link when embedUrl is null", () => {
    // Simulates the host-allowlist downgrade inside resolveDemo
    render(
      <DemoEmbed
        demo={demo({
          type: "youtube",
          url: "https://example.com/fake",
          embedUrl: null,
        })}
      />
    );
    expect(screen.getByTestId("demo-embed-link")).toBeInTheDocument();
  });

  it("renders a native <video> with controls for video type", () => {
    render(
      <DemoEmbed
        demo={demo({ type: "video", url: "https://cdn.example.com/clip.mp4" })}
      />
    );
    const video = screen.getByTestId("demo-embed-video");
    expect(video.tagName.toLowerCase()).toBe("video");
    expect(video).toHaveAttribute("controls");
    expect(video).toHaveAttribute("preload", "metadata");
    const source = video.querySelector("source");
    expect(source).toHaveAttribute("src", "https://cdn.example.com/clip.mp4");
  });

  it("renders an <img> with lazy loading for image type", () => {
    render(
      <DemoEmbed
        demo={demo({ type: "image", url: "https://cdn.example.com/s.png" })}
      />
    );
    const img = screen.getByTestId("demo-embed-image") as HTMLImageElement;
    expect(img.tagName.toLowerCase()).toBe("img");
    expect(img).toHaveAttribute("src", "https://cdn.example.com/s.png");
    expect(img).toHaveAttribute("loading", "lazy");
    expect(img).toHaveAttribute("decoding", "async");
  });

  it("renders an <img> for gif type (same treatment as image)", () => {
    render(
      <DemoEmbed
        demo={demo({ type: "gif", url: "https://cdn.example.com/demo.gif" })}
      />
    );
    expect(screen.getByTestId("demo-embed-image")).toHaveAttribute(
      "data-demo-type",
      "gif"
    );
  });

  it("renders an outbound link for 'other' type with rel noopener noreferrer", () => {
    render(
      <DemoEmbed
        demo={demo({
          type: "other",
          url: "https://example.com/page",
          title: "Demo page",
        })}
      />
    );
    const link = screen.getByTestId("demo-embed-link") as HTMLAnchorElement;
    expect(link).toHaveAttribute("href", "https://example.com/page");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link.rel).toContain("noopener");
    expect(link.rel).toContain("noreferrer");
    expect(link.textContent).toMatch(/Demo page/);
  });

  it("falls through to broken-media card on <img> onError", () => {
    render(
      <DemoEmbed
        demo={demo({ type: "image", url: "https://cdn.example.com/broken" })}
      />
    );
    fireEvent.error(screen.getByTestId("demo-embed-image"));
    expect(screen.getByTestId("demo-embed-broken")).toBeInTheDocument();
    // Broken card offers an "open in new tab" escape hatch
    const link = screen.getByText(/Open in new tab/i).closest("a");
    expect(link).toHaveAttribute("href", "https://cdn.example.com/broken");
  });

  it("falls through to broken-media card on <video> onError", () => {
    render(
      <DemoEmbed
        demo={demo({ type: "video", url: "https://cdn.example.com/404.mp4" })}
      />
    );
    fireEvent.error(screen.getByTestId("demo-embed-video"));
    expect(screen.getByTestId("demo-embed-broken")).toBeInTheDocument();
  });
});
