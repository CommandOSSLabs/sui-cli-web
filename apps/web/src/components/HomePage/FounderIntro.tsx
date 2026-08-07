import type { ReactNode } from 'react';
import { Reveal } from './wireframe/reveal';

function Highlight({ children }: { children: ReactNode }) {
  return (
    <span className="mx-1 inline-flex items-center rounded-full border border-foreground/40 bg-foreground/10 px-2.5 py-0.5 align-middle font-mono text-[0.55em] text-foreground">
      {children}
    </span>
  );
}

export function FounderIntro() {
  return (
    <section className="relative z-20 overflow-hidden px-4 py-16 sm:py-20 md:py-24">
      {/* Decorative out-of-focus text behind the statement below - same
          layered-depth motif as the testimonial wall's blur, just static
          instead of hover-driven. Purely visual, hidden from assistive tech. */}
      <p
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 flex select-none items-center justify-center px-8 text-center font-bold text-3xl text-foreground/[0.05] leading-none blur-sm sm:text-5xl md:text-6xl"
      >
        publish build sign deploy inspect transfer
      </p>

      <div className="relative mx-auto max-w-3xl">
        <Reveal>
          <p className="mb-8 font-mono text-xs uppercase tracking-[0.2em] text-foreground/30 sm:mb-10">
            <span className="text-foreground">$</span> who built it
          </p>

          <p className="text-2xl leading-snug tracking-[-0.01em] text-foreground sm:text-3xl md:text-4xl">
            Hey, I&apos;m <Highlight>HARRY</Highlight>. Publishing a package used to be four
            terminal tabs and a prayer, so I built this to make it one keystroke. I work at{' '}
            <Highlight>COMMANDOSS</Highlight> and live in <Highlight>VIETNAM</Highlight>.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
