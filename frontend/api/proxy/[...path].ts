import type { VercelRequest, VercelResponse } from '@vercel/node';

const BACKEND = 'http://13.126.62.128';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const path = (req.query.path as string[] || []).join('/');
  const url = `${BACKEND}/${path}${req.url?.includes('?') ? '?' + req.url.split('?')[1] : ''}`;

  const init: RequestInit = {
    method: req.method,
    headers: { ...req.headers, host: undefined as any },
    body: ['GET','HEAD'].includes(req.method || '') ? undefined : (req as any),
  };

  const r = await fetch(url, init);
  const body = Buffer.from(await r.arrayBuffer());

  r.headers.forEach((v, k) => {
    if (!['content-encoding','transfer-encoding','connection'].includes(k.toLowerCase())) {
      res.setHeader(k, v);
    }
  });

  res.status(r.status).send(body);
}
