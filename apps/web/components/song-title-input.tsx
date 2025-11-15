'use client'

import React, { useEffect, useRef, useState } from 'react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'

type Suggestion = {
  title: string
  artistCredit: string
}

interface SongTitleInputProps {
  value: string
  placeholder?: string
  className?: string
  disabled?: boolean
  onChange: (value: string) => void
  onSelectSuggestion?: (suggestion: { title: string, artist: string }) => void
  limit?: number
}

export function SongTitleInput({ value, placeholder, className, disabled, onChange, onSelectSuggestion, limit = 5 }: SongTitleInputProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [highlightIndex, setHighlightIndex] = useState(-1)
  const [isComposing, setIsComposing] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)

  useEffect(() => {
    setQuery(value)
  }, [value])

  useEffect(() => {
    if (isComposing) return
    const q = query?.trim()
    if (!q) {
      setSuggestions([])
      setOpen(false)
      setOffset(0)
      setHasMore(false)
      return
    }
    const h = setTimeout(async () => {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      try {
        setLoading(true)
        const encoded = encodeURIComponent(`recording:"${q}"`)
        const url = `https://musicbrainz.org/ws/2/recording?query=${encoded}&limit=${limit}&offset=0&fmt=json`
        const res = await fetch(url, { signal: controller.signal, headers: { 'Accept': 'application/json' } })
        if (!res.ok) throw new Error('failed')
        const data = await res.json()
        type Recording = {
          title?: string;
          'artist-credit'?: Array<{ name?: string; joinphrase?: string }>;
        };
        const list: Suggestion[] = ((data?.recordings as Recording[]) || []).map((r) => {
          const credit = Array.isArray(r?.['artist-credit']) ? r['artist-credit'] : []
          const artistCredit = credit.map((c) => `${c?.name || ''}${c?.joinphrase || ''}`).join('')
          return { title: r?.title || '', artistCredit }
        }).filter((s: Suggestion) => s.title)
        setSuggestions(list)
        setOpen(list.length > 0)
        setHighlightIndex(list.length > 0 ? 0 : -1)
        const total = typeof data?.count === 'number' ? data.count : undefined
        if (typeof total === 'number') {
          setHasMore(limit < total)
        } else {
          setHasMore(list.length === limit)
        }
        setOffset(limit)
      } catch (e) {
        if (e instanceof Error && e.name === 'AbortError') return
      } finally {
        setLoading(false)
      }
    }, 300)
    return () => clearTimeout(h)
  }, [query, isComposing, limit])

  const loadMore = async () => {
    if (loadingMore || loading) return
    if (!hasMore) return
    const q = query?.trim()
    if (!q) return
    const controller = new AbortController()
    abortRef.current = controller
    try {
      setLoadingMore(true)
      const encoded = encodeURIComponent(`recording:"${q}"`)
      const url = `https://musicbrainz.org/ws/2/recording?query=${encoded}&limit=${limit}&offset=${offset}&fmt=json`
      const res = await fetch(url, { signal: controller.signal, headers: { 'Accept': 'application/json' } })
      if (!res.ok) throw new Error('failed')
      const data = await res.json()
      type Recording = {
        title?: string;
        'artist-credit'?: Array<{ name?: string; joinphrase?: string }>;
      };
      const list: Suggestion[] = ((data?.recordings as Recording[]) || []).map((r) => {
        const credit = Array.isArray(r?.['artist-credit']) ? r['artist-credit'] : []
        const artistCredit = credit.map((c) => `${c?.name || ''}${c?.joinphrase || ''}`).join('')
        return { title: r?.title || '', artistCredit }
      }).filter((s: Suggestion) => s.title)
      if (list.length > 0) {
        setSuggestions(prev => {
          const seen = new Set(prev.map(p => `${p.title}__${p.artistCredit}`))
          const merged = [...prev]
          for (const s of list) {
            const key = `${s.title}__${s.artistCredit}`
            if (!seen.has(key)) {
              merged.push(s)
              seen.add(key)
            }
          }
          return merged
        })
        setOffset(prev => prev + limit)
      }
      const total = typeof data?.count === 'number' ? data.count : undefined
      if (typeof total === 'number') {
        setHasMore(offset + limit < total)
      } else {
        setHasMore(list.length === limit)
      }
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') return
    } finally {
      setLoadingMore(false)
    }
  }

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!containerRef.current) return
      if (!containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || isComposing) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightIndex(i => Math.min(i + 1, suggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightIndex(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      if (highlightIndex >= 0 && suggestions[highlightIndex]) {
        e.preventDefault()
        const s = suggestions[highlightIndex]
        onChange(s.title)
        onSelectSuggestion?.({ title: s.title, artist: s.artistCredit })
        setOpen(false)
      }
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  const handleSelect = (s: Suggestion) => {
    onChange(s.title)
    onSelectSuggestion?.({ title: s.title, artist: s.artistCredit })
    setOpen(false)
    inputRef.current?.focus()
  }

  return (
    <div ref={containerRef} className="relative">
      <Input
        ref={inputRef}
        value={value}
        onChange={(e) => { onChange(e.target.value); setQuery(e.target.value); setOpen(true) }}
        onKeyDown={handleKeyDown}
        onCompositionStart={() => setIsComposing(true)}
        onCompositionEnd={(e) => { setIsComposing(false); setQuery((e.target as HTMLInputElement).value) }}
        placeholder={placeholder}
        className={className}
        disabled={disabled}
        autoComplete="off"
      />
      {open && (suggestions.length > 0 || loading) && (
        <div
          ref={listRef}
          onScroll={(e) => {
            const el = e.currentTarget
            if (el.scrollTop + el.clientHeight >= el.scrollHeight - 8) {
              loadMore()
            }
          }}
          className="absolute z-50 mt-1 w-full rounded-md border bg-white shadow-md max-h-60 overflow-auto"
        >
          {loading && (
            <div className="px-3 py-2 space-y-2">
              <Skeleton className="h-6 w-3/4" />
              <Skeleton className="h-6 w-2/3" />
              <Skeleton className="h-6 w-1/2" />
            </div>
          )}
          {!loading && suggestions.map((s, idx) => (
            <button
              key={`${s.title}-${idx}`}
              type="button"
              className={cn(
                'w-full text-left px-3 py-2 text-sm hover:bg-gray-100',
                idx === highlightIndex && 'bg-gray-100'
              )}
              onMouseEnter={() => setHighlightIndex(idx)}
              onClick={() => handleSelect(s)}
            >
              <div className="font-medium truncate">{s.title}</div>
              {s.artistCredit && (
                <div className="text-xs text-gray-600 truncate">{s.artistCredit}</div>
              )}
            </button>
          ))}
          {loadingMore && (
            <div className="px-3 py-2">
              <Skeleton className="h-6 w-2/3" />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default SongTitleInput


