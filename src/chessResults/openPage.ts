import { chessResultsApi } from './api';

export async function openChessResultsPage(key: string, section: 'admin' | 'upload') {
  const popup = window.open('about:blank', '_blank');
  if (!popup) throw new Error('Allow pop-ups for this site and try again.');
  try {
    popup.opener = null;
    const result = await chessResultsApi.adminLink({ key, section });
    const url = new URL(result.url || 'about:blank');
    const upload = section === 'upload';
    const path = upload ? '/UploadData.aspx' : '/Stammdaten.aspx';
    const params = url.searchParams;
    const encrypted = /^[A-Fa-f0-9]{32}$/;
    if (url.origin !== 'https://chess-results.com' || url.pathname !== path ||
      params.get(upload ? 'tnr' : 'key1') !== key ||
      !encrypted.test(params.get(upload ? 'sid' : 'tnr_sec') || '') ||
      !encrypted.test(params.get(upload ? 'sid1' : 'luser_sec') || '') ||
      (upload && (params.get('source') !== '21' || params.get('lan') !== '0' || !/^\d{14}$/.test(params.get('time') || '')))) {
      throw new Error('Chess-Results returned an invalid authenticated link.');
    }
    if (popup.closed) throw new Error('The Chess-Results tab was closed.');
    popup.location.replace(url.href);
  } catch (error) {
    popup.close();
    throw error;
  }
}
