import { useEffect, useRef } from 'react'
import { useApp } from '../AppContext'
import { JOB_KINDS, type JobKindId } from '../data/jobKinds'
import { JobKindIcon } from './JobKindIcon'
import { Button } from './ui'

/** Big tiles for a new job: one tap picks the kind of job. */
export function JobKindTiles({ onPick, onSkip }: { onPick: (kind: JobKindId) => void; onSkip: () => void }) {
  const { t, lang } = useApp()
  return (
    <div>
      <p className="mb-3 text-lg font-bold">{t.kindQuestion}</p>
      <div className="grid grid-cols-3 gap-2">
        {JOB_KINDS.map((k, i) => (
          <button
            key={k.id}
            type="button"
            onClick={() => onPick(k.id)}
            // Handyman gets the full first row: most jobs here are small mixed ones.
            className={`flex items-center justify-center rounded-2xl border-2 border-ink bg-white px-1 text-center text-base leading-tight font-bold break-words active:bg-brand ${
              i === 0 ? 'col-span-3 min-h-14 gap-2' : 'min-h-22 flex-col gap-1.5 py-2'
            }`}
          >
            <JobKindIcon kind={k.id} className="size-8 shrink-0" />
            {k[lang]}
          </button>
        ))}
      </div>
      <Button variant="ghost" className="mt-2 w-full text-muted" onClick={onSkip}>
        {t.skip}
      </Button>
    </div>
  )
}

/** A row of chips to change a job's kind. Tapping the picked one clears it. Scrolls sideways. */
export function JobKindChips({ value, onChange }: { value: string | null; onChange: (kind: JobKindId | null) => void }) {
  const { t, lang } = useApp()
  const picked = useRef<HTMLButtonElement>(null)

  // Bring the picked kind into view when the sheet opens; it may be far along the row.
  useEffect(() => {
    picked.current?.scrollIntoView({ block: 'nearest', inline: 'center' })
  }, [])

  return (
    <div role="group" aria-label={t.kindOfJob}>
      <div className="mb-1 text-base font-bold">{t.kindOfJob}</div>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
        {JOB_KINDS.map((k) => {
          const on = value === k.id
          return (
            <button
              key={k.id}
              ref={on ? picked : undefined}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(on ? null : k.id)}
              className={`flex min-h-12 shrink-0 items-center gap-1.5 rounded-full border-2 border-ink px-3.5 text-base font-bold ${
                on ? 'bg-ink text-white' : 'bg-white text-ink active:bg-gray-100'
              }`}
            >
              <JobKindIcon kind={k.id} className="size-5" />
              {k[lang]}
            </button>
          )
        })}
      </div>
    </div>
  )
}
