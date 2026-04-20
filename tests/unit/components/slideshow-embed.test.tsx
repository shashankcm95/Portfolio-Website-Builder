import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { SlideshowEmbed } from "@/components/projects/slideshow-embed";
import { SLIDESHOW_ADVANCE_MS, type ResolvedDemo } from "@/lib/demos/types";

function makeDemos(n: number): ResolvedDemo[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `d${i}`,
    url: `https://cdn.example.com/${i}.png`,
    type: "image" as const,
    title: `Slide ${i + 1}`,
    order: i,
    embedUrl: null,
    isEmbeddable: true,
  }));
}

describe("<SlideshowEmbed />", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it("returns null for an empty demo list", () => {
    const { container } = render(<SlideshowEmbed demos={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders the first slide initially", () => {
    render(<SlideshowEmbed demos={makeDemos(3)} />);
    const container = screen.getByTestId("slideshow-embed");
    expect(container).toHaveAttribute("data-current-index", "0");
    const img = container.querySelector("img");
    expect(img).toHaveAttribute("src", "https://cdn.example.com/0.png");
  });

  it("auto-advances on the SLIDESHOW_ADVANCE_MS timer", () => {
    render(<SlideshowEmbed demos={makeDemos(3)} />);
    act(() => {
      jest.advanceTimersByTime(SLIDESHOW_ADVANCE_MS);
    });
    expect(screen.getByTestId("slideshow-embed")).toHaveAttribute(
      "data-current-index",
      "1"
    );
    act(() => {
      jest.advanceTimersByTime(SLIDESHOW_ADVANCE_MS);
    });
    expect(screen.getByTestId("slideshow-embed")).toHaveAttribute(
      "data-current-index",
      "2"
    );
  });

  it("loops back to index 0 after the last slide", () => {
    render(<SlideshowEmbed demos={makeDemos(2)} />);
    act(() => {
      jest.advanceTimersByTime(SLIDESHOW_ADVANCE_MS * 2);
    });
    expect(screen.getByTestId("slideshow-embed")).toHaveAttribute(
      "data-current-index",
      "0"
    );
  });

  it("pauses on mouse enter and resumes on leave", () => {
    render(<SlideshowEmbed demos={makeDemos(3)} />);
    const region = screen.getByTestId("slideshow-embed");

    fireEvent.mouseEnter(region);
    expect(region).toHaveAttribute("data-paused", "true");

    act(() => {
      jest.advanceTimersByTime(SLIDESHOW_ADVANCE_MS * 3);
    });
    // Still on slide 0 — timer was paused
    expect(region).toHaveAttribute("data-current-index", "0");

    fireEvent.mouseLeave(region);
    expect(region).toHaveAttribute("data-paused", "false");
  });

  it("does NOT auto-advance with a single slide", () => {
    render(<SlideshowEmbed demos={makeDemos(1)} />);
    act(() => {
      jest.advanceTimersByTime(SLIDESHOW_ADVANCE_MS * 5);
    });
    expect(screen.getByTestId("slideshow-embed")).toHaveAttribute(
      "data-current-index",
      "0"
    );
    // Arrow buttons hidden for single-slide case
    expect(screen.queryByTestId("slideshow-prev")).toBeNull();
    expect(screen.queryByTestId("slideshow-next")).toBeNull();
    expect(screen.queryByTestId("slideshow-indicators")).toBeNull();
  });

  it("arrow buttons advance/retreat", () => {
    render(<SlideshowEmbed demos={makeDemos(3)} />);
    fireEvent.click(screen.getByTestId("slideshow-next"));
    expect(screen.getByTestId("slideshow-embed")).toHaveAttribute(
      "data-current-index",
      "1"
    );
    fireEvent.click(screen.getByTestId("slideshow-prev"));
    expect(screen.getByTestId("slideshow-embed")).toHaveAttribute(
      "data-current-index",
      "0"
    );
  });

  it("arrow keys navigate when region is focused", () => {
    render(<SlideshowEmbed demos={makeDemos(3)} />);
    const region = screen.getByTestId("slideshow-embed");
    region.focus();
    fireEvent.keyDown(region, { key: "ArrowRight" });
    expect(region).toHaveAttribute("data-current-index", "1");
    fireEvent.keyDown(region, { key: "ArrowLeft" });
    expect(region).toHaveAttribute("data-current-index", "0");
  });

  it("dot indicators jump to specific slide on click", () => {
    render(<SlideshowEmbed demos={makeDemos(4)} />);
    const indicators = screen
      .getByTestId("slideshow-indicators")
      .querySelectorAll("button");
    expect(indicators).toHaveLength(4);
    fireEvent.click(indicators[3]);
    expect(screen.getByTestId("slideshow-embed")).toHaveAttribute(
      "data-current-index",
      "3"
    );
    expect(indicators[3]).toHaveAttribute("aria-current", "true");
    expect(indicators[0]).toHaveAttribute("aria-current", "false");
  });

  it("hides a slide when its image errors, continues navigation", async () => {
    render(<SlideshowEmbed demos={makeDemos(3)} />);
    const img = screen
      .getByTestId("slideshow-embed")
      .querySelector("img")!;
    fireEvent.error(img);
    await waitFor(() =>
      expect(
        screen.getByText(/Couldn't load this slide/i)
      ).toBeInTheDocument()
    );
    fireEvent.click(screen.getByTestId("slideshow-next"));
    expect(screen.getByTestId("slideshow-embed")).toHaveAttribute(
      "data-current-index",
      "1"
    );
  });

  it("exposes carousel role and aria-roledescription", () => {
    render(<SlideshowEmbed demos={makeDemos(3)} title="Product tour" />);
    const region = screen.getByTestId("slideshow-embed");
    expect(region).toHaveAttribute("role", "region");
    expect(region).toHaveAttribute("aria-roledescription", "carousel");
    expect(region.getAttribute("aria-label")).toMatch(/Product tour/);
    expect(region.getAttribute("aria-label")).toMatch(/1 of 3/);
  });
});
