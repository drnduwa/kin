import { NextResponse } from 'next/server';
import { buildFlash } from '@/lib/flash-server';

/**
 * Flash trafic pour les radios et partenaires.
 *   GET /api/flash            → JSON { fr, ln, lines, updatedAt, source }
 *   GET /api/flash?format=txt → texte brut à lire à l'antenne
 * Les données sont mises en cache 90 s côté serveur.
 */
export async function GET(request: Request) {
  const flash = await buildFlash();
  const format = new URL(request.url).searchParams.get('format');
  const headers = { 'Cache-Control': 'public, max-age=60', 'Access-Control-Allow-Origin': '*' };
  if (format === 'txt') {
    return new NextResponse(`${flash.fr}\n\n${flash.ln}\n`, { headers: { ...headers, 'Content-Type': 'text/plain; charset=utf-8' } });
  }
  return NextResponse.json(flash, { headers });
}
