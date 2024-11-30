export type LiveArchive = {
  name: string;
  year: number;
  youtubeLink: string;
};

export type ArchiveByYear = {
  [year: number]: LiveArchive[];
};

export type GetYoutubeId = (url: string) => string | null;

export type ScrollToSection = (year: string) => void;

export type IsYoutubePlaylist = (url: string) => boolean;

