/** The centred title above a standalone form: login, sign-up, reset, invite. */
export function FormHeading({
  title,
  description,
}: {
  title: string
  description: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-1 text-center">
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="text-sm text-balance text-muted-foreground">
        {description}
      </p>
    </div>
  )
}
