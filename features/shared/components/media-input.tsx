"use client"

import { ImageIcon, Undo2, Upload, X } from "lucide-react"
import { useFormatter, useTranslations } from "next-intl"
import Image from "next/image"
import { type Ref, useEffect, useRef, useState } from "react"

import { IdentityAvatar } from "@/features/shared/components/identity-avatar"
import { Button } from "@/features/shared/components/ui/button"

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
  // Keyed by the file it shows, so a preview never outlives its file and a
  // revoked URL is never rendered.
  const [preview, setPreview] = useState<{ file: File; url: string }>()

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

  function removeFile() {
    if (internalInputRef.current) internalInputRef.current.value = ""
    selectFile(undefined)
  }

  const storedUrl = cleared ? undefined : (currentUrl ?? undefined)
  const shownUrl = previewUrl ?? storedUrl
  const canClear = Boolean(file || (currentUrl && !cleared))

  function formatFileSize(bytes: number) {
    const { value, ...options } = fileSize(bytes)

    return format.number(value, { style: "unit", ...options })
  }

  return (
    <div className="flex h-14 items-center gap-2">
      <div className="relative flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted">
        {shownUrl ? (
          <Image
            src={shownUrl}
            alt=""
            fill
            sizes="56px"
            className={
              previewFit === "cover" ? "object-cover" : "object-contain"
            }
            unoptimized
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
        aria-invalid={invalid}
        onChange={(event) => selectFile(event.target.files?.[0])}
      />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            className="min-w-0 flex-1 justify-start"
            disabled={disabled}
            aria-invalid={invalid}
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
              onClick={onRestore}
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
                onClick={file ? removeFile : onClear}
              >
                <X />
              </Button>
            )
          )}
        </div>
        <p
          className={
            error
              ? "h-4 truncate text-xs text-destructive"
              : "h-4 truncate text-xs text-muted-foreground"
          }
          role={error ? "alert" : undefined}
        >
          {error ??
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
