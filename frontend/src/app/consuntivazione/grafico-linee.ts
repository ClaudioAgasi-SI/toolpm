import { Component, computed, DestroyRef, ElementRef, inject, input, signal } from '@angular/core';

export interface SerieGrafico {
  nome: string;
  colore: string;
  valori: (number | null)[];
}

export interface FasciaGrafico {
  min: number;
  max: number;
  colore: string;
  etichetta: string;
}

const H = 240;
const M = { su: 12, destra: 92, giu: 26, sinistra: 64 };

/** Valori "tondi" per l'asse: circa n tacche tra min e max. */
export function tacche(min: number, max: number, n = 4): number[] {
  if (max <= min) return [min];
  const grezzo = (max - min) / n;
  const potenza = 10 ** Math.floor(Math.log10(grezzo));
  const passo = [1, 2, 2.5, 5, 10].map((m) => m * potenza).find((p) => p >= grezzo) ?? grezzo;
  const inizio = Math.ceil(min / passo) * passo;
  const valori: number[] = [];
  for (let v = inizio; v <= max + passo * 1e-9; v += passo) valori.push(Math.round(v / passo) * passo);
  return valori;
}

/**
 * Grafico a linee in SVG su un solo asse (fase 4, blocco E3): una linea per serie, fasce orizzontali facoltative,
 * etichetta del nome a fine linea, legenda, mirino e suggerimento al passaggio del mouse.
 */
@Component({
  selector: 'app-grafico-linee',
  template: `
    <figure class="grafico">
      <figcaption>
        <span class="titolo">{{ titolo() }}</span>
        @if (serie().length > 1) {
          <span class="legenda">
            @for (s of serie(); track s.nome) {
              <span class="voce"><span class="segno" [style.background]="s.colore"></span>{{ s.nome }}</span>
            }
          </span>
        }
      </figcaption>
      <div class="area" (mouseleave)="punto.set(null)">
        <svg [attr.viewBox]="'0 0 ' + L() + ' ' + H" role="img" [attr.aria-label]="titolo()">
          @for (f of fasceDisegnate(); track f.etichetta) {
            <rect [attr.x]="M.sinistra" [attr.width]="L() - M.sinistra - M.destra" [attr.y]="f.y" [attr.height]="f.h" [attr.fill]="f.colore" />
            <text class="fascia" [attr.x]="L() - M.destra - 6" [attr.y]="f.y + 12" text-anchor="end">{{ f.etichetta }}</text>
          }
          @for (t of asseY(); track t.v) {
            <line class="griglia" [attr.x1]="M.sinistra" [attr.x2]="L() - M.destra" [attr.y1]="t.y" [attr.y2]="t.y" />
            <text class="asse" [attr.x]="M.sinistra - 8" [attr.y]="t.y + 4" text-anchor="end">{{ formato()(t.v) }}</text>
          }
          @for (t of asseX(); track t.i) {
            <text class="asse" [attr.x]="t.x" [attr.y]="H - 6" text-anchor="middle">{{ t.testo }}</text>
          }
          @for (s of linee(); track s.nome) {
            <path [attr.d]="s.d" [attr.stroke]="s.colore" fill="none" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke" />
            @if (s.fine) {
              <text class="nome" [attr.x]="s.fine.x + 6" [attr.y]="s.fine.y + 4">{{ s.nome }}</text>
            }
          }
          @if (punto(); as p) {
            <line class="mirino" [attr.x1]="x(p)" [attr.x2]="x(p)" [attr.y1]="M.su" [attr.y2]="H - M.giu" />
            @for (s of serie(); track s.nome) {
              @if (s.valori[p] !== null) {
                <circle [attr.cx]="x(p)" [attr.cy]="y(s.valori[p]!)" r="4" [attr.fill]="s.colore" stroke="#fff" stroke-width="2" />
              }
            }
          }
          <rect class="presa" [attr.x]="M.sinistra" [attr.y]="0" [attr.width]="L() - M.sinistra - M.destra" [attr.height]="H" (mousemove)="muovi($event)" />
        </svg>
        @if (punto(); as p) {
          <div class="suggerimento" [style.left.%]="(x(p) / L()) * 100" [class.a-sinistra]="x(p) > L() * 0.6">
            <div class="data">{{ dataLunga(date()[p]) }}</div>
            @for (s of serie(); track s.nome) {
              <div><span class="segno" [style.background]="s.colore"></span>{{ s.nome }} <strong>{{ s.valori[p] === null ? '—' : formato()(s.valori[p]!) }}</strong></div>
            }
          </div>
        }
      </div>
    </figure>
  `,
  styles: `
    :host { display: block; }
    .grafico { margin: 0.5rem 0 1rem; }
    figcaption { display: flex; justify-content: space-between; gap: 1rem; flex-wrap: wrap; font-size: 0.85rem; margin-bottom: 0.25rem; }
    .titolo { font-weight: 600; }
    .legenda { display: flex; gap: 0.9rem; color: #3d4556; }
    .segno { display: inline-block; width: 12px; height: 3px; border-radius: 2px; vertical-align: middle; margin-right: 5px; }
    .area { position: relative; }
    svg { width: 100%; height: 240px; display: block; overflow: visible; }
    .griglia { stroke: #e9ecf1; stroke-width: 1; vector-effect: non-scaling-stroke; }
    .mirino { stroke: #9aa3b2; stroke-width: 1; stroke-dasharray: 3 3; vector-effect: non-scaling-stroke; }
    text { font-size: 11px; fill: #5a6478; }
    text.nome { fill: #2b3140; font-weight: 600; }
    text.fascia { fill: #6b7385; font-size: 10px; }
    .presa { fill: transparent; cursor: crosshair; }
    .suggerimento { position: absolute; top: 8px; transform: translateX(12px); background: #fff; border: 1px solid #d8dde6; border-radius: 6px;
      padding: 6px 10px; font-size: 0.8rem; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08); pointer-events: none; white-space: nowrap; z-index: 1; }
    .suggerimento.a-sinistra { transform: translateX(calc(-100% - 12px)); }
    .suggerimento .data { color: #5a6478; margin-bottom: 2px; }
  `,
})
export class GraficoLinee {
  readonly titolo = input('');
  /** Date AAAA-MM-GG, una per punto. */
  readonly date = input.required<string[]>();
  readonly serie = input.required<SerieGrafico[]>();
  readonly formato = input<(n: number) => string>((n) => String(n));
  readonly fasce = input<FasciaGrafico[]>([]);
  /** Limiti dell'asse da includere comunque (es. 0 e 1,2 per gli indici). */
  readonly includi = input<number[]>([0]);

  /** Larghezza reale in pixel: il viewBox la segue, così il testo non si deforma. */
  protected readonly L = signal(800);

  constructor() {
    const el = inject(ElementRef<HTMLElement>).nativeElement as HTMLElement;
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(([e]) => this.L.set(Math.max(320, Math.round(e.contentRect.width))));
      ro.observe(el);
      inject(DestroyRef).onDestroy(() => ro.disconnect());
    }
  }
  protected readonly H = H;
  protected readonly M = M;
  protected readonly punto = signal<number | null>(null);

  private readonly limiti = computed(() => {
    const valori = this.serie().flatMap((s) => s.valori.filter((v): v is number => v !== null));
    const tutti = [...valori, ...this.includi()];
    let min = Math.min(...tutti);
    let max = Math.max(...tutti);
    if (min === max) max = min + 1;
    const margine = (max - min) * 0.05;
    min = min < 0 ? min - margine : min;
    max += margine;
    return { min, max };
  });

  protected x(i: number) {
    const n = this.date().length;
    return M.sinistra + (n <= 1 ? 0 : (i / (n - 1)) * (this.L() - M.sinistra - M.destra));
  }

  protected y(v: number) {
    const { min, max } = this.limiti();
    return M.su + (1 - (v - min) / (max - min)) * (H - M.su - M.giu);
  }

  protected readonly asseY = computed(() => {
    const { min, max } = this.limiti();
    return tacche(min, max).map((v) => ({ v, y: this.y(v) }));
  });

  /** Una data ogni mese circa (primo giorno del mese presente), al massimo 8. */
  protected readonly asseX = computed(() => {
    const date = this.date();
    const inizi = date.map((d, i) => ({ d, i })).filter((x, k) => k === 0 || x.d.slice(0, 7) !== date[x.i - 1].slice(0, 7));
    const passo = Math.max(1, Math.ceil(inizi.length / 8));
    return inizi
      .filter((_, k) => k % passo === 0)
      .map(({ d, i }) => ({ i, x: this.x(i), testo: new Date(`${d}T00:00:00Z`).toLocaleDateString('it-IT', { month: 'short', year: '2-digit', timeZone: 'UTC' }) }));
  });

  protected readonly linee = computed(() =>
    this.serie().map((s) => {
      let d = '';
      let fine: { x: number; y: number } | null = null;
      s.valori.forEach((v, i) => {
        if (v === null) return;
        const px = this.x(i);
        const py = this.y(v);
        d += `${d && s.valori[i - 1] !== null ? 'L' : 'M'}${px.toFixed(1)},${py.toFixed(1)}`;
        fine = { x: px, y: py };
      });
      return { nome: s.nome, colore: s.colore, d, fine: fine as { x: number; y: number } | null };
    }),
  );

  protected readonly fasceDisegnate = computed(() => {
    const { min, max } = this.limiti();
    return this.fasce()
      .map((f) => {
        const alto = this.y(Math.min(f.max, max));
        const basso = this.y(Math.max(f.min, min));
        return { ...f, y: alto, h: Math.max(0, basso - alto) };
      })
      .filter((f) => f.h > 0);
  });

  protected muovi(ev: MouseEvent) {
    const svg = (ev.target as SVGRectElement).ownerSVGElement!;
    const r = svg.getBoundingClientRect();
    const xSvg = ((ev.clientX - r.left) / r.width) * this.L();
    const n = this.date().length;
    if (!n) return;
    const i = Math.round(((xSvg - M.sinistra) / (this.L() - M.sinistra - M.destra)) * (n - 1));
    this.punto.set(Math.min(n - 1, Math.max(0, i)));
  }

  protected dataLunga(d: string) {
    return new Date(`${d}T00:00:00Z`).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  }
}
