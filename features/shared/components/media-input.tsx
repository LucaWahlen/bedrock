"use client"

import { ImageIcon, Undo2, Upload, X } from "lucide-react"
import { useFormatter, useTranslations } from "next-intl"
import Image from "next/image"
import { type Ref, useEffect, useRef, useState } from "react"

import { IdentityAvatar } from "@/features/shared/components/identity-avatar"
import { Button } from "@/features/shared/components/ui/button"
import { canDecodeMediaFile } from "@/features/shared/lib/media-upload"
import {
  MAX_MEDIA_BYTES,
  MEDIA_EXTENSIONS,
} from "@/features/shared/lib/storage/media"

interface MediaInputProps {
  id: string
  name: string
  accept: string
  hint: string
  file?: File
  // The image the organization already has, if any.
  currentUrl?: string | null
  // Whether that stored image is to go when the form is saved.
  cleared?: boolean
  fallbackName?: string
  // An organization being created has no id to seed a colour with yet.
  fallbackSeed?: string | null
  previewFit?: "contain" | "cover"
  disabled?: boolean
  invalid?: boolean
  error?: string
  inputRef?: Ref<HTMLInputElement>
  onBlur: () => void
  onChange: (file?: File) => void
  onClear?: () => void
  onRestore?: () => void
}

function setRef<T>(ref: Ref<T> | undefined, value: T | null) {
  if (typeof ref === "function") ref(value)
  else if (ref) (ref as { current: T | null }).current = value
}

function fileSize(bytes: number) {
  return bytes < 1024 * 1024
    ? {
        value: Math.max(1, Math.round(bytes / 1024)),
        unit: "kilobyte",
        maximumFractionDigits: 0,
      }
    : {
        value: bytes / (1024 * 1024),
        unit: "megabyte",
        maximumFractionDigits: 1,
      }
}

export function MediaInput({
  id,
  name,
  accept,
  hint,
  file,
  currentUrl,
  cleared,
  fallbackName,
  fallbackSeed,
  previewFit = "contain",
  disabled,
  invalid,
  error,
  inputRef,
  onBlur,
  onChange,
  onClear,
  onRestore,
}: MediaInputProps) {
  const t = useTranslations("common.media")
  const format = useFormatter()
  const internalInputRef = useRef<HTMLInputElement>(null)
  const selectionRequestRef = useRef(0)
  // Keyed by the file it shows, so a preview never outlives its file and a
  // revoked URL is never rendered.
  const [preview, setPreview] = useState<{ file: File; url: string }>()
  const [failedUrl, setFailedUrl] = useState<string>()
  const [localError, setLocalError] = useState<string>()

  useEffect(() => {
    if (!file) return

    const url = URL.createObjectURL(file)
    // The object URL is an external resource whose lifetime this effect owns.
    // oxlint-disable-next-line react/set-state-in-effect
    setPreview({ file, url })
    return () => URL.revokeObjectURL(url)
  }, [file])

  const previewUrl = file && preview?.file === file ? preview.url : undefined

  function selectFile(nextFile?: File) {
    onChange(nextFile)
    onBlur()
  }

  async function chooseFile(nextFile?: File) {
    const request = ++selectionRequestRef.current
    setLocalError(undefined)

    if (
      nextFile &&
      nextFile.size > 0 &&
      nextFile.size <= MAX_MEDIA_BYTES &&
      nextFile.type in MEDIA_EXTENSIONS
    ) {
      const readable = await canDecodeMediaFile(nextFile)
      if (request !== selectionRequestRef.current) return
      if (!readable) {
        if (internalInputRef.current) internalInputRef.current.value = ""
        selectFile(undefined)
        setLocalError(t("invalid"))
        return
      }
    }

    selectFile(nextFile)
  }

  function removeFile() {
    selectionRequestRef.current += 1
    setLocalError(undefined)
    if (internalInputRef.current) internalInputRef.current.value = ""
    selectFile(undefined)
  }

  function clearStored() {
    selectionRequestRef.current += 1
    setLocalError(undefined)
    onClear?.()
  }

  function restoreStored() {
    selectionRequestRef.current += 1
    setLocalError(undefined)
    onRestore?.()
  }

  const storedUrl = cleared ? undefined : (currentUrl ?? undefined)
  const shownUrl = previewUrl ?? storedUrl
  const renderableUrl =
    shownUrl && shownUrl !== failedUrl ? shownUrl : undefined
  const canClear = Boolean(file || (currentUrl && !cleared))
  const displayedError = error ?? localError
  const isInvalid = Boolean(invalid || localError)

  function formatFileSize(bytes: number) {
    const { value, ...options } = fileSize(bytes)

    return format.number(value, { style: "unit", ...options })
  }

  return (
    <div className="flex h-14 items-center gap-2">
      <div className="relative flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted">
        {renderableUrl ? (
          <Image
            ref={(element) => {
              if (element?.complete && element.naturalWidth === 0) {
                setFailedUrl(renderableUrl)
              }
            }}
            src={renderableUrl}
            alt=""
            fill
            sizes="56px"
            className={
              previewFit === "cover" ? "object-cover" : "object-contain"
            }
            unoptimized
            onError={() => setFailedUrl(renderableUrl)}
          />
        ) : fallbackName ? (
          <IdentityAvatar
            name={fallbackName}
            seed={fallbackSeed ?? null}
            variant="lg"
          />
        ) : (
          <ImageIcon className="size-5 text-muted-foreground" />
        )}
      </div>
      <input
        ref={(element) => {
          internalInputRef.current = element
          setRef(inputRef, element)
        }}
        id={id}
        name={name}
        type="file"
        accept={accept}
        tabIndex={-1}
        className="sr-only"
        disabled={disabled}
        aria-invalid={isInvalid}
        onChange={(event) => void chooseFile(event.target.files?.[0])}
      />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            className="min-w-0 flex-1 justify-start"
            disabled={disabled}
            aria-invalid={isInvalid}
            onBlur={onBlur}
            onClick={() => internalInputRef.current?.click()}
          >
            <Upload />
            <span className="truncate">
              {file?.name ?? (storedUrl ? t("replace") : t("choose"))}
            </span>
          </Button>
          {cleared && onRestore ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="shrink-0"
              disabled={disabled}
              aria-label={t("keep")}
              title={t("keep")}
              onClick={restoreStored}
            >
              <Undo2 />
            </Button>
          ) : (
            canClear && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="shrink-0"
                disabled={disabled}
                aria-label={
                  file ? t("removeFile", { name: file.name }) : t("remove")
                }
                title={t("remove")}
                onClick={file ? removeFile : clearStored}
              >
                <X />
              </Button>
            )
          )}
        </div>
        <p
          className={
            displayedError
              ? "h-4 truncate text-xs text-destructive"
              : "h-4 truncate text-xs text-muted-foreground"
          }
          role={displayedError ? "alert" : undefined}
        >
          {displayedError ??
            (file
              ? formatFileSize(file.size)
              : cleared
                ? t("removedOnSave")
                : hint)}
        </p>
      </div>
    </div>
  )
}
