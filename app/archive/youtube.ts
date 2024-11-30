import { GetYoutubeId, IsYoutubePlaylist } from './archive';

export const isYoutubePlaylist: IsYoutubePlaylist = (url: string) => {
  return url.includes('playlist?list=');
};

export const getYoutubeId: GetYoutubeId = (url: string) => {
  if (isYoutubePlaylist(url)) {
    const match = url.match(/[&?]list=([^&]+)/i);
    return match ? match[1] : null;
  }
  
  // youtu.be形式のURLからIDを抽出
  const shortMatch = url.match(/youtu\.be\/([^?]+)/);
  if (shortMatch) {
    return shortMatch[1];
  }
  
  // 通常のYouTube URLからIDを抽出
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : null;
};

