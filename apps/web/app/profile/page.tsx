import { redirect } from 'next/navigation'
import { getServerUser, getServerUserData } from '@/lib/server-api'
import { ProfilePage } from './profile-page'
import { SetupWizard } from './setup-wizard'
import { UserData, Role, Instrument } from '@/app/types'

export default async function Page() {
  const user = await getServerUser()
  
  if (!user) {
    redirect('/login')
  }

  const userDataResponse = await getServerUserData()
  
  if (!userDataResponse.success || !userDataResponse.data) {
    redirect('/login')
  }

  const userData: UserData = {
    grade: userDataResponse.data.grade,
    name: userDataResponse.data.name ?? '',
    role: userDataResponse.data.role as Role,
    email: userDataResponse.data.email,
    nickname: userDataResponse.data.nickname,
    instruments: userDataResponse.data.instruments as Instrument[],
    student_number: userDataResponse.data.student_number
  }

  const needsSetup = !userData.nickname || userData.instruments.length === 0
  
  if (needsSetup) {
    return <SetupWizard initialUserData={userData} />
  } else {
    return <ProfilePage userData={userData} />
  }
}
