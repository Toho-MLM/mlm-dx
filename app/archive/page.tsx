'use client';

import React, { useMemo, useRef } from 'react';
import { LiveArchive, ArchiveByYear, ScrollToSection } from './archive';
import { getYoutubeId, isYoutubePlaylist } from './youtube';

const archiveData: LiveArchive[] = [
  { name: "大森祭", year: 2024, youtubeLink: "https://www.youtube.com/playlist?list=PLR04jXsMZAQMoiI3mMqk5elOF_XAsWnMr" },
  { name: "夏合宿", year: 2024, youtubeLink: "https://www.youtube.com/playlist?list=PLR04jXsMZAQM6q-xWj5cSk5mPBQpBSmZt" },
  { name: "定期演奏会", year: 2024, youtubeLink: "https://www.youtube.com/playlist?list=PLR04jXsMZAQME1za2BIZxGGzmt39Vu1_S" },
  { name: "そうたさんライブ", year: 2024, youtubeLink: "https://youtu.be/J73B9HD0rXY" },
  { name: "新春会", year: 2023, youtubeLink: "https://www.youtube.com/playlist?list=PLR04jXsMZAQPGvhhiLAsdU2yC-OfXKlU3" },
  { name: "忘年会", year: 2023, youtubeLink: "https://www.youtube.com/playlist?list=PLR04jXsMZAQO5pydjgip7Fdi8WMyaEG4U" },
  { name: "定期演奏会", year: 2019, youtubeLink: "https://www.youtube.com/playlist?list=PLR04jXsMZAQM-CFvWNQieUsX95BhKkobr" },
  { name: "定期演奏会", year: 2018, youtubeLink: "https://www.youtube.com/playlist?list=PLR04jXsMZAQPZHls_V4GQ3a2paq4s7zfh" },
  { name: "大森祭", year: 2017, youtubeLink: "https://www.youtube.com/playlist?list=PLR04jXsMZAQPBqHboJp6GoKclNj0LosHz" },
  { name: "定期演奏会", year: 2017, youtubeLink: "https://www.youtube.com/playlist?list=PLR04jXsMZAQNy-XlJ6lOsMcWAtrRomitV" },
  { name: "大森祭", year: 2016, youtubeLink: "https://www.youtube.com/playlist?list=PLR04jXsMZAQNrlrZxIAEDe3PRHiaCmwCl" },
  { name: "定期演奏会", year: 2016, youtubeLink: "https://www.youtube.com/playlist?list=PLR04jXsMZAQNdWjucr2AkaMBxxWLAv6SI" },
  { name: "一年生ライブ", year: 2016, youtubeLink: "https://www.youtube.com/playlist?list=PLR04jXsMZAQP0h_11_QL4vQtHUN7yt_fR" },
  { name: "大森祭", year: 2015, youtubeLink: "https://www.youtube.com/playlist?list=PLR04jXsMZAQNFlu3Va2b1gVuX2_w7Q1Pq" },
  { name: "定期演奏会", year: 2015, youtubeLink: "https://www.youtube.com/playlist?list=PLR04jXsMZAQPgeC6ZSPebQBn0oRX4rcYr" },
];

const YouTubeArchiveList: React.FC = () => {
  const archiveByYear = useMemo(() => {
    return archiveData.reduce((acc: ArchiveByYear, curr) => {
      if (!acc[curr.year]) {
        acc[curr.year] = [];
      }
      acc[curr.year].push(curr);
      return acc;
    }, {});
  }, []);

  const years = useMemo(() => Object.keys(archiveByYear).sort((a, b) => Number(b) - Number(a)), [archiveByYear]);

  const sectionRefs = useRef<{ [key: string]: React.RefObject<HTMLElement> }>({});

  // 各年のセクションに対する参照を作成
  years.forEach((year) => {
    sectionRefs.current[year] = React.createRef<HTMLElement>();
  });

  const scrollToSection: ScrollToSection = (year) => {
    const section = sectionRefs.current[year];
    if (section && section.current) {
      section.current.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-4xl font-bold mb-8 text-center">ライブアーカイブ</h1>
      
      {/* 目次 */}
      <nav className="mb-12 p-4 bg-gray-100 rounded-lg shadow">
        <h2 className="text-2xl font-semibold mb-4">目次</h2>
        <ul className="flex flex-wrap gap-4">
          {years.map((year) => (
            <li key={year}>
              <button
                onClick={() => scrollToSection(year)}
                className="text-blue-600 hover:text-blue-800 transition-colors"
              >
                {year}年
              </button>
            </li>
          ))}
        </ul>
      </nav>

      {/* アーカイブリスト */}
      {years.map((year) => (
        <section key={year} id={`year-${year}`} ref={sectionRefs.current[year]} className="mb-12">
          <h2 className="text-3xl font-bold mb-6 pb-2 border-b-2 border-gray-200">{year}年度</h2>
          <ul className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {archiveByYear[Number(year)].map((archive, index) => {
              const youtubeId = getYoutubeId(archive.youtubeLink);
              return (
                <li key={index} className="bg-white rounded-lg shadow-md overflow-hidden transition-transform hover:scale-105">
                  {!isYoutubePlaylist(archive.youtubeLink) && (
                    <div className="aspect-w-16 aspect-h-9">
                      <iframe
                        src={`https://www.youtube.com/embed/${youtubeId}`}
                        title={archive.name}
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                        className="w-full h-full"
                      ></iframe>
                    </div>
                  )}
                  <div className="p-4">
                    <h3 className="text-xl font-semibold mb-2 text-gray-800">{archive.name}</h3>
                    <a 
                      href={archive.youtubeLink} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="inline-block bg-red-600 text-white px-4 py-2 rounded text-sm hover:bg-red-700 transition-colors"
                    >
                      {isYoutubePlaylist(archive.youtubeLink) ? 'プレイリストを見る' : '動画を視聴'}
                    </a>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
};

export default YouTubeArchiveList;