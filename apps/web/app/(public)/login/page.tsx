import { LoginPage } from "../../login/login"

export const dynamic = 'force-static'
export const revalidate = false

export default function Page() {
  return <LoginPage />
}


