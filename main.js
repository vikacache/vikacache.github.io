/* vikacache - carousel + before/after compare + scroll reveal */
(() => {
  "use strict";

  /* ---------- Launch copy variant ---------- */
  const launchVariant = "comingSoon"; // Switch to "available" when the Asset Store page is live.
  const launchCopy = {
    comingSoon: {
      kicker: "Coming soon on the Unity Asset Store",
      cta: "Coming soon on the Asset\u00a0Store",
      ctaEnabled: false,
    },
    available: {
      kicker: "Available on the Unity Asset Store",
      cta: "Get MatScale on the Asset\u00a0Store",
      ctaEnabled: true,
    },
  };

  const activeLaunchCopy = launchCopy[launchVariant] || launchCopy.comingSoon;

  document.querySelectorAll("[data-launch-copy]").forEach((el) => {
    const key = el.dataset.launchCopy;
    if (activeLaunchCopy[key]) {
      el.textContent = activeLaunchCopy[key];
    }
  });

  document.querySelectorAll("[data-launch-cta]").forEach((el) => {
    if (activeLaunchCopy.ctaEnabled) {
      el.href = el.dataset.availableHref;
      el.removeAttribute("aria-disabled");
      el.removeAttribute("tabindex");
    } else {
      el.removeAttribute("href");
      el.setAttribute("aria-disabled", "true");
      el.setAttribute("tabindex", "-1");
    }
  });

  /* ---------- Before/after compare sliders ---------- */
  document.querySelectorAll(".compare").forEach((compare) => {
    const range = compare.querySelector(".compare-range");
    range.addEventListener("input", () => {
      compare.style.setProperty("--pos", range.value + "%");
    });
  });

  /* ---------- Carousel ---------- */
  const carousel = document.querySelector(".carousel");
  if (carousel) {
    const track = carousel.querySelector(".carousel-track");
    const slides = [...carousel.querySelectorAll(".carousel-slide")];
    const dots = [...carousel.querySelectorAll(".carousel-dots button")];
    const arrows = [...carousel.querySelectorAll(".carousel-btn")];
    let index = 0;

    const goTo = (i) => {
      index = (i + slides.length) % slides.length;
      track.style.transform = `translateX(-${index * 100}%)`;
      dots.forEach((dot, d) => dot.setAttribute("aria-selected", String(d === index)));
      slides.forEach((slide, s) => {
        // keep off-screen slides out of the tab order
        slide.querySelectorAll("input, button, a").forEach((el) => {
          el.tabIndex = s === index ? 0 : -1;
        });
      });
    };

    arrows.forEach((btn) =>
      btn.addEventListener("click", () => goTo(index + Number(btn.dataset.dir)))
    );
    dots.forEach((dot, d) => dot.addEventListener("click", () => goTo(d)));

    goTo(0);
  }

  /* ---------- Copy-to-clipboard (contact page) ---------- */
  document.querySelectorAll(".copy-btn").forEach((btn) => {
    const original = btn.textContent;
    btn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(btn.dataset.copy);
        btn.textContent = "Copied";
        btn.classList.add("is-copied");
      } catch {
        // clipboard API unavailable (e.g. non-secure context) - select the text instead
        const range = document.createRange();
        range.selectNodeContents(document.getElementById("support-email"));
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        btn.textContent = "Press Ctrl+C";
      }
      setTimeout(() => {
        btn.textContent = original;
        btn.classList.remove("is-copied");
      }, 2000);
    });
  });

  /* ---------- Scroll reveal (progressive enhancement) ---------- */
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if ("IntersectionObserver" in window && !reduceMotion) {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-in");
            io.unobserve(entry.target);
          }
        });
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 }
    );

    document.querySelectorAll("[data-reveal]").forEach((el) => {
      // only arm elements still below the fold; never hide visible content
      if (el.getBoundingClientRect().top > window.innerHeight) {
        el.classList.add("is-armed");
      }
      io.observe(el);
    });
  }

  /* ---------- Inertial scrolling (Lenis, self-hosted) ---------- */
  let lenis = null;
  if (window.Lenis && !reduceMotion) {
    lenis = new window.Lenis({ lerp: 0.09, smoothWheel: true });
    const lenisRaf = (time) => {
      lenis.raf(time);
      requestAnimationFrame(lenisRaf);
    };
    requestAnimationFrame(lenisRaf);

    // eased anchor navigation for the panel-to-panel feel
    document.querySelectorAll('a[href^="#"]').forEach((a) => {
      a.addEventListener("click", (e) => {
        const id = a.getAttribute("href");
        if (id.length > 1 && document.querySelector(id)) {
          e.preventDefault();
          lenis.scrollTo(id, { duration: 1.4, easing: (t) => 1 - Math.pow(1 - t, 4) });
        }
      });
    });
  }

  /* ---------- Hero background: dither grid that constructs as you scroll ----------
     Each grid cell holds a 4x4 micro-pattern. At rest the pattern is random noise
     (chaotic dithering) with a quiet ambient drift. As the user scrolls through
     the hero, cells lock onto an ordered Bayer-lattice texture, sweeping up from
     the bottom with per-cell stagger; scrolling back disassembles it. The older
     pointer-hover mode is kept behind HOVER_ENABLED for possible revival.
     Canvas-rendered, dirty-cell redraws only. */
  const HOVER_ENABLED = false;
  const hero = document.querySelector(".hero");
  if (hero) {
    const canvas = document.createElement("canvas");
    canvas.className = "hero-canvas";
    canvas.setAttribute("aria-hidden", "true");
    hero.prepend(canvas);
    const ctx = canvas.getContext("2d");

    const CELL = 32;            // grid box size
    const PITCH = 7;            // micro-dot spacing inside a box
    const DOT = 3;              // micro-dot size
    const PAD = 4;              // inset of the 4x4 micro-grid
    const RADIUS = 360;         // pointer influence radius
    const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

    // sRGB approximations of --ink-faint and --accent-bright
    const GRAY = [168, 162, 161];
    const RED = [233, 84, 78];

    // precomputed gray->red ramp; reused strings avoid per-dot GC churn
    const COLORS = Array.from({ length: 16 }, (_, k) => {
      const f = k / 15;
      const ch = (a, b) => Math.round(a + (b - a) * f);
      return `rgb(${ch(GRAY[0], RED[0])},${ch(GRAY[1], RED[1])},${ch(GRAY[2], RED[2])})`;
    });

    let cols = 0;
    let rows = 0;
    let cells = [];
    let pointer = null;
    let scrollP = 0; // 0 = chaos, 1 = fully constructed (driven by scroll)
    let running = false;
    let visible = true;

    /* Chaos state: each dot gets a random position inside the cell, a random
       strength, and a lock-in threshold. As the cell organizes, dots travel
       one by one from their scattered spot onto the 4x4 lattice. */
    const randomChaos = () => {
      const span = CELL - PAD * 2 - DOT;
      const px = new Float32Array(16);
      const py = new Float32Array(16);
      const pa = new Float32Array(16);
      for (let i = 0; i < 16; i++) {
        px[i] = PAD + Math.random() * span;
        py[i] = PAD + Math.random() * span;
        pa[i] = Math.random() < 0.42 ? 0.25 + Math.random() * 0.75 : 0;
      }
      return { px, py, pa };
    };

    // per-dot lock-in order, shuffled once so the stagger differs per cell
    const randomFlips = () => {
      const order = [...Array(16).keys()];
      for (let i = 15; i > 0; i--) {
        const j = (Math.random() * (i + 1)) | 0;
        [order[i], order[j]] = [order[j], order[i]];
      }
      const flips = new Float32Array(16);
      for (let i = 0; i < 16; i++) flips[order[i]] = (i / 16) * 0.62;
      return flips;
    };

    const smooth = (v) => v * v * (3 - 2 * v);

    /* The constructed pattern, composed across cells so it reads like a game
       texture swatch rather than one tile repeated: adjacent cells alternate
       ramp direction (UV-checker feel), and every 4th cell row/column gets a
       bright seam line of dots, like tile borders in a texture atlas. */
    const orderedPattern = (col, row) => {
      const arr = new Float32Array(16);
      const invert = (col + row) % 2 === 1;
      for (let i = 0; i < 16; i++) {
        let o = (15 - BAYER[i]) / 15;
        if (invert) o = 1 - o;
        if (col % 4 === 0 && i % 4 === 0) o = Math.max(o, 0.95); // vertical seam
        if (row % 4 === 0 && i < 4) o = Math.max(o, 0.95);       // horizontal seam
        arr[i] = o;
      }
      return arr;
    };

    const drawCell = (c) => {
      ctx.clearRect(c.x, c.y, CELL, CELL);
      const t = smooth(c.t);
      for (let i = 0; i < 16; i++) {
        // per-dot progress: this dot only starts locking once t passes its threshold
        let p = (t - c.flips[i]) / 0.38;
        p = p < 0 ? 0 : p > 1 ? 1 : p;
        p = smooth(p);
        const ordered = c.ordered[i];
        const alpha = (c.chaos.pa[i] + (ordered - c.chaos.pa[i]) * p) * (0.16 + 0.3 * p);
        if (alpha < 0.02) continue;
        const lx = PAD + (i % 4) * PITCH;
        const ly = PAD + ((i / 4) | 0) * PITCH;
        const x = c.chaos.px[i] + (lx - c.chaos.px[i]) * p;
        const y = c.chaos.py[i] + (ly - c.chaos.py[i]) * p;
        ctx.fillStyle = COLORS[(p * 15 + 0.5) | 0];
        ctx.globalAlpha = alpha;
        ctx.fillRect(c.x + x, c.y + y, DOT, DOT);
      }
      ctx.globalAlpha = 1;
    };

    const build = () => {
      const w = hero.clientWidth;
      const h = hero.clientHeight;
      // decorative layer: 1.5x is visually identical for 3px dots, ~half the fill cost of 2x
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = w + "px";
      canvas.style.height = h + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cols = Math.ceil(w / CELL);
      rows = Math.ceil(h / CELL);
      cells = [];
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const cell = {
            x: col * CELL,
            y: row * CELL,
            t: 0,
            chaos: randomChaos(),
            flips: randomFlips(),
            ordered: orderedPattern(col, row),
            // per-cell breathing so the constructed state keeps living
            phase: Math.random() * Math.PI * 2,
            freq: 0.6 + Math.random() * 0.9,
            // scroll stagger: bottom rows construct first, with jitter
            delay: ((rows - 1 - row) / rows) * 0.25 + Math.random() * 0.3,
            q: 0, // last painted quantum (see tick)
          };
          cells.push(cell);
          drawCell(cell);
        }
      }
    };

    let soft = null; // spring-smoothed pointer: the blob trails the cursor

    const tick = (now) => {
      if (!visible) { running = false; return; }
      now = now || performance.now();

      if (HOVER_ENABLED && pointer) {
        if (!soft) soft = { x: pointer.x, y: pointer.y };
        soft.x += (pointer.x - soft.x) * 0.1;
        soft.y += (pointer.y - soft.y) * 0.1;
      } else if (soft) {
        soft = null;
      }

      for (const c of cells) {
        let target = 0;
        if (soft) {
          const dx = c.x + CELL / 2 - soft.x;
          const dy = c.y + CELL / 2 - soft.y;
          let d = Math.hypot(dx, dy);
          // wavy boundary: three slow-rotating lobes instead of a circle
          d *= 1 + 0.14 * Math.sin(Math.atan2(dy, dx) * 3 + now * 0.0009);
          if (d < RADIUS) {
            // cosine falloff (wide soft gradient) modulated by per-cell
            // breathing, so the interior keeps partially de/re-structuring
            const base = 0.5 + 0.5 * Math.cos((Math.PI * d) / RADIUS);
            const breathe = 0.62 + 0.38 * Math.sin(now * 0.0011 * c.freq + c.phase);
            target = base * breathe;
          }
        } else if (scrollP > 0) {
          // scroll-driven construction: each cell starts once progress passes
          // its stagger delay; breathing fades as the lattice locks in
          let c0 = (scrollP * 1.25 - c.delay) / 0.5;
          c0 = c0 < 0 ? 0 : c0 > 1 ? 1 : c0;
          if (c0 > 0) {
            // breathing settles almost flat once a cell is locked in
            const amp = 0.3 * (1 - c0) + 0.05;
            target = c0 * (1 - amp + amp * Math.sin(now * 0.0011 * c.freq + c.phase));
          }
        }
        const delta = target - c.t;
        if (Math.abs(delta) > 0.004) {
          c.t += delta * 0.14;
        } else if (c.t !== target && target === 0) {
          c.t = 0;
        }
        // repaint only when the cell crosses a visible step, not every frame
        const q = (c.t * 72 + 0.5) | 0;
        if (q !== c.q) {
          c.q = q;
          drawCell(c);
        }
      }
      // ambient shimmer: a few resting cells re-roll their noise each frame
      for (let n = 0; n < 3; n++) {
        const c = cells[(Math.random() * cells.length) | 0];
        if (c && c.t < 0.25) {
          c.chaos = randomChaos();
          drawCell(c);
        }
      }
      // keep idling while visible: ambient drift + breathing never freeze
      requestAnimationFrame(tick);
    };

    const wake = () => {
      if (!running && visible) {
        running = true;
        requestAnimationFrame(tick);
      }
    };

    build();

    if (!reduceMotion) {
      if (HOVER_ENABLED) {
        hero.addEventListener("pointermove", (e) => {
          const rect = hero.getBoundingClientRect();
          pointer = { x: e.clientX - rect.left, y: e.clientY - rect.top };
          wake();
        });
        hero.addEventListener("pointerleave", () => {
          pointer = null;
          wake();
        });
      }

      // scroll drives the construction and the hero parallax; fully built
      // once ~70% of the hero has scrolled past, disassembles on the way back
      const onScroll = () => {
        const y = window.scrollY;
        scrollP = Math.min(1, Math.max(0, y / (hero.clientHeight * 0.7)));
        hero.style.setProperty("--scroll-y", y.toFixed(1));
        wake();
      };
      window.addEventListener("scroll", onScroll, { passive: true });
      onScroll();

      if ("IntersectionObserver" in window) {
        new IntersectionObserver((entries) => {
          visible = entries[0].isIntersecting;
          if (visible) wake();
        }).observe(hero);
      }

      let resizeTimer;
      window.addEventListener("resize", () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(build, 150);
      });

      wake();
    }
  }
})();
