export type organization = {
  id: string
  name: string
  slug: string
  logo?: string | null
  isRoot: boolean
  color?: string | null
  backgroundImage?: string | null
}

export type user = {
  name: string
  email: string
  image?: string | null
}
