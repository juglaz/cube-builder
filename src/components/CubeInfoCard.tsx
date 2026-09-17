import { useRef, useState, type CSSProperties, type DragEvent } from 'react'
import { MAGIC_ART_HEIGHT_IN, MAGIC_ART_WIDTH_IN, imageFileToInfoArt } from '../lib/cubeInfo'

export type CubeInfoArt = {
  src: string
  name: string
  cover?: boolean
}

type Props = {
  name: string
  description: string
  themes: string[]
  size: number
  art?: CubeInfoArt[]
  className?: string
  onNameChange?: (value: string) => void
  onDescriptionChange?: (value: string) => void
  onArtChange?: (dataUrl: string | null) => void
}

export function CubeInfoCard({
  name,
  description,
  themes,
  size,
  art = [],
  className = '',
  onNameChange,
  onDescriptionChange,
  onArtChange,
}: Props) {
  const faces = art.slice(0, 4)
  const cover = Boolean(faces[0]?.cover) || faces.length === 1
  const fileRef = useRef<HTMLInputElement>(null)
  const [artOver, setArtOver] = useState(false)
  const [artError, setArtError] = useState<string | null>(null)
  const artEditable = Boolean(onArtChange)

  async function applyArtFile(file: File | undefined) {
    if (!file || !onArtChange) return
    try {
      const dataUrl = await imageFileToInfoArt(file)
      setArtError(null)
      onArtChange(dataUrl)
    } catch (err) {
      setArtError(err instanceof Error ? err.message : 'Could not read that image.')
    }
  }

  function onArtDrop(event: DragEvent<HTMLDivElement>) {
    if (!onArtChange) return
    event.preventDefault()
    setArtOver(false)
    void applyArtFile(event.dataTransfer.files[0])
  }

  return (
    <article
      className={`cube-info-card ${className}`}
      style={cardShell}
    >
      <div style={innerFrame}>
        <header style={nameBar}>
          {onNameChange ? (
            <input
              value={name}
              onChange={(event) => onNameChange(event.target.value)}
              aria-label="Cube name"
              spellCheck
              style={nameInput}
            />
          ) : (
            <h2 style={nameText}>{name || 'Untitled cube'}</h2>
          )}
        </header>

        <div
          style={{
            ...artBox,
            outline: artOver ? '0.12em solid #f4ead2' : undefined,
            outlineOffset: '-0.12em',
          }}
          onDragEnter={(event) => {
            if (!onArtChange) return
            event.preventDefault()
            setArtOver(true)
          }}
          onDragOver={(event) => {
            if (!onArtChange) return
            event.preventDefault()
            setArtOver(true)
          }}
          onDragLeave={() => setArtOver(false)}
          onDrop={onArtDrop}
        >
          {faces.length === 0 ? (
            <div style={artFallback}>
              <span style={artMark}>✦</span>
              <span style={artCaption}>{artEditable ? 'Add art' : 'Cube'}</span>
            </div>
          ) : cover ? (
            <img
              src={faces[0]!.src}
              alt=""
              draggable={false}
              style={{
                ...artImage,
                objectPosition: faces[0]!.cover ? 'center' : 'center 18%',
              }}
            />
          ) : (
            <div
              style={{
                ...artGrid,
                gridTemplateColumns: faces.length === 1 ? '1fr' : '1fr 1fr',
                gridTemplateRows: faces.length > 2 ? '1fr 1fr' : '1fr',
              }}
            >
              {faces.map((face) => (
                <img
                  key={face.src + face.name}
                  src={face.src}
                  alt=""
                  draggable={false}
                  style={artImage}
                />
              ))}
            </div>
          )}
          {artEditable ? (
            <>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  event.target.value = ''
                  void applyArtFile(file)
                }}
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                aria-label="Upload custom art"
                style={artHit}
              >
                <span style={artChip}>{faces.length === 0 ? 'Add art' : 'Replace art'}</span>
              </button>
              {artError ? <p style={artErrorText}>{artError}</p> : null}
            </>
          ) : null}
        </div>

        <div style={typeLine}>
          <p style={typeLineText}>
            <span>Cube</span>
            <span style={typeDash}>—</span>
            <span>Information</span>
          </p>
          <span style={setSymbol} title={`${size} cards`}>
            {size}
          </span>
        </div>

        <div style={textBox}>
          {onDescriptionChange ? (
            <textarea
              value={description}
              onChange={(event) => onDescriptionChange(event.target.value)}
              rows={4}
              spellCheck
              aria-label="Cube description"
              style={descriptionInput}
            />
          ) : (
            <p style={descriptionText}>{description}</p>
          )}
          {themes.length > 0 ? (
            <p style={themeBlock}>
              <span style={themeLabel}>Primary themes</span>
              {themes.join(', ')}
            </p>
          ) : onNameChange ? (
            <p style={themeBlock}>
              <span style={themeLabel}>Primary themes</span>
              —
            </p>
          ) : null}
        </div>

        <footer style={footer}>Cube Builder</footer>
      </div>
    </article>
  )
}

const cardShell: CSSProperties = {
  boxSizing: 'border-box',
  containerType: 'inline-size',
  aspectRatio: '2.5 / 3.5',
  width: '100%',
  padding: '3.2%',
  borderRadius: '4.8% / 3.4%',
  background: '#0b0b0c',
  color: '#1a1410',
  fontFamily: '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif',
  printColorAdjust: 'exact',
  WebkitPrintColorAdjust: 'exact',
}

const innerFrame: CSSProperties = {
  display: 'grid',
  gridTemplateRows: 'auto auto auto minmax(0, 1fr) auto',
  height: '100%',
  minHeight: 0,
  padding: '2.4% 3% 0.7%',
  borderRadius: '3.4% / 2.4%',
  background:
    'linear-gradient(180deg, #d7c49a 0%, #b0894d 18%, #8d6b38 52%, #6f542c 100%)',
  boxShadow: 'inset 0 0 0 0.08em rgba(255, 236, 190, 0.35)',
}

const nameBar: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  minHeight: '8.2%',
  padding: '0.12em 0.45em',
  borderRadius: '0.55em',
  background: 'linear-gradient(180deg, #f4ead2 0%, #e2d0a8 55%, #cbb589 100%)',
  boxShadow: '0 0.06em 0 rgba(0,0,0,0.35), inset 0 0.05em 0 rgba(255,255,255,0.55)',
}

const nameText: CSSProperties = {
  margin: 0,
  fontSize: '6.1cqw',
  fontWeight: 800,
  letterSpacing: '0.01em',
  lineHeight: 1.15,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const nameInput: CSSProperties = {
  ...nameText,
  width: '100%',
  minWidth: 0,
  padding: 0,
  border: 0,
  background: 'transparent',
  color: 'inherit',
  fontFamily: 'inherit',
  outline: 'none',
}

const artBox: CSSProperties = {
  position: 'relative',
  width: '100%',
  aspectRatio: `${MAGIC_ART_WIDTH_IN} / ${MAGIC_ART_HEIGHT_IN}`,
  margin: '2.4% 0 0',
  overflow: 'hidden',
  border: '0.09em solid #3a2a14',
  background: '#111318',
}

const artGrid: CSSProperties = {
  display: 'grid',
  height: '100%',
}

const artImage: CSSProperties = {
  width: '100%',
  height: '100%',
  objectFit: 'cover',
  objectPosition: 'center 18%',
}

const artFallback: CSSProperties = {
  display: 'flex',
  height: '100%',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '0.2em',
  background: 'radial-gradient(circle at 50% 40%, #3a3228 0%, #16120e 70%)',
  color: '#e8d7a8',
}

const artMark: CSSProperties = {
  fontSize: '12cqw',
  lineHeight: 1,
  opacity: 0.85,
}

const artCaption: CSSProperties = {
  fontSize: '4.4cqw',
  letterSpacing: '0.28em',
  textTransform: 'uppercase',
}

const artHit: CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  alignItems: 'flex-end',
  justifyContent: 'center',
  margin: 0,
  padding: '0 0 4%',
  border: 0,
  background: 'transparent',
  cursor: 'pointer',
}

const artChip: CSSProperties = {
  padding: '0.15em 0.45em',
  borderRadius: '999px',
  background: 'rgba(12, 10, 8, 0.72)',
  color: '#f4ead2',
  fontSize: '3.2cqw',
  fontWeight: 700,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
}

const artErrorText: CSSProperties = {
  position: 'absolute',
  inset: '0 0 auto',
  margin: 0,
  padding: '3% 4%',
  background: 'rgba(80, 16, 16, 0.88)',
  color: '#f8d4d4',
  fontSize: '3.4cqw',
  lineHeight: 1.25,
}

const typeLine: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '0.4em',
  minHeight: '7.2%',
  margin: '1.6% 0 0',
  padding: '0.08em 0.28em 0.08em 0.45em',
  borderRadius: '0.5em',
  background: 'linear-gradient(180deg, #f4ead2 0%, #e2d0a8 55%, #cbb589 100%)',
  boxShadow: '0 0.06em 0 rgba(0,0,0,0.35), inset 0 0.05em 0 rgba(255,255,255,0.55)',
  fontSize: '4.7cqw',
  fontWeight: 700,
}

const typeLineText: CSSProperties = {
  display: 'flex',
  minWidth: 0,
  alignItems: 'center',
  gap: '0.35em',
  margin: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const typeDash: CSSProperties = {
  opacity: 0.7,
}

const setSymbol: CSSProperties = {
  display: 'inline-flex',
  flexShrink: 0,
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: '1.35em',
  height: '1.2em',
  padding: '0 0.18em',
  borderRadius: '0.22em',
  background: 'linear-gradient(180deg, #4a3a22 0%, #2a1e10 100%)',
  boxShadow: 'inset 0 0.05em 0 rgba(255,236,190,0.35), 0 0.04em 0 rgba(0,0,0,0.35)',
  color: '#f4ead2',
  fontSize: '3.9cqw',
  fontWeight: 700,
  letterSpacing: 0,
  lineHeight: 1,
}

const textBox: CSSProperties = {
  display: 'flex',
  minHeight: 0,
  flexDirection: 'column',
  margin: '1.4% 1.2% 0',
  padding: '3.4% 3.6% 3%',
  overflow: 'hidden',
  background: 'linear-gradient(180deg, #f6edd8 0%, #efe4cc 100%)',
  border: '0.07em solid #5c4a2e',
}

const descriptionText: CSSProperties = {
  margin: 0,
  fontSize: '4.15cqw',
  lineHeight: 1.28,
}

const descriptionInput: CSSProperties = {
  display: 'block',
  width: '100%',
  minHeight: '4.4em',
  flex: 1,
  margin: 0,
  padding: 0,
  resize: 'none',
  border: 0,
  background: 'transparent',
  color: 'inherit',
  font: 'inherit',
  fontSize: '4.15cqw',
  lineHeight: 1.28,
  outline: 'none',
}

const themeBlock: CSSProperties = {
  margin: '0.4em 0 0',
  fontSize: '3.85cqw',
  lineHeight: 1.28,
}

const themeLabel: CSSProperties = {
  display: 'block',
  marginBottom: '0.12em',
  fontSize: '3.35cqw',
  fontWeight: 700,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
}

const footer: CSSProperties = {
  marginTop: '0.4%',
  padding: '0 1.5% 0',
  color: '#f4ead2',
  fontSize: '2.15cqw',
  letterSpacing: '0.1em',
  lineHeight: 1.15,
  textTransform: 'uppercase',
  opacity: 0.85,
}
