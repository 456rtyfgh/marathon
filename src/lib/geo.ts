import type { Race, Region } from './types';
import { isDomestic } from './util';

export type Box = { x: number; y: number; w: number; h: number };

/**
 * 나라 코드(소문자) → 지역. 대회 데이터의 country_code·region 에서 만든다.
 * 국내 대회는 모두 'kr' → '한국'.
 */
export function countryRegion(races: Race[]): Record<string, Region> {
  const out: Record<string, Region> = {};
  for (const r of races) out[isDomestic(r) ? 'kr' : r.country_code.toLowerCase()] = r.region;
  return out;
}

/**
 * 지도 path 의 조각(섬·본토)별 경계 상자.
 * svg-maps 의 path 는 상대좌표 m … z 만 쓰므로 그것만 읽는다.
 */
export function pathBoxes(d: string): Box[] {
  const t = d.match(/[mzMZ]|-?\d*\.?\d+(?:e-?\d+)?/g) ?? [];
  const out: Box[] = [];
  let cx = 0, cy = 0, sx = 0, sy = 0;
  let x1 = 0, y1 = 0, x2 = 0, y2 = 0;
  let open = false;
  const close = () => {
    if (open) out.push({ x: x1, y: y1, w: x2 - x1, h: y2 - y1 });
    open = false;
  };
  for (let i = 0; i < t.length; ) {
    const k = t[i];
    if (k === 'm' || k === 'M') {
      close();
      const abs = k === 'M';
      i++;
      let first = true;
      while (i + 1 < t.length && !/[mzMZ]/.test(t[i])) {
        const a = Number(t[i]), b = Number(t[i + 1]);
        i += 2;
        // 첫 쌍은 이동, 나머지는 선 (M 이면 절대좌표, m 이면 상대좌표)
        if (abs) {
          cx = a;
          cy = b;
        } else {
          cx += a;
          cy += b;
        }
        if (first) {
          sx = cx; sy = cy;
          x1 = x2 = cx; y1 = y2 = cy;
          first = false;
          open = true;
        } else {
          x1 = Math.min(x1, cx); y1 = Math.min(y1, cy);
          x2 = Math.max(x2, cx); y2 = Math.max(y2, cy);
        }
      }
    } else if (k === 'z' || k === 'Z') {
      close();
      cx = sx; cy = sy;
      i++;
    } else i++;
  }
  close();
  return out;
}

/** 가장 큰 조각 (미국 본토·프랑스 본토처럼, 알래스카·해외 영토는 뺀다) */
export function mainBox(d: string): Box | null {
  let best: Box | null = null;
  for (const b of pathBoxes(d)) if (!best || b.w * b.h > best.w * best.h) best = b;
  return best;
}

export const union = (a: Box, b: Box): Box => {
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
};
