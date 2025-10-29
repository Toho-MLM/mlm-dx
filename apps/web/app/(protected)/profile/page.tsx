import { redirect } from 'next/navigation'
import { getServerUserData } from '@/lib/server-api'
import { ProfilePage } from './profile-page'
import { SetupWizard } from './setup-wizard'
import { UserData, Role, Instrument } from '@/app/types'

export default async function Page() {

  const userDataResponse = await getServerUserData()
  
  if (!userDataResponse.success || !userDataResponse.data) {
    redirect('/login')
  }

  const anyData = userDataResponse.data as any;
  const userData: UserData = {
    grade: userDataResponse.data.grade,
    name: userDataResponse.data.name ?? '',
    role: userDataResponse.data.role as Role,
    email: userDataResponse.data.email,
    nickname: userDataResponse.data.nickname,
    instruments: userDataResponse.data.instruments as Instrument[],
    student_number: anyData?.student_number
  }

  const needsSetup = !userData.nickname || userData.instruments.length === 0
  
  if (needsSetup) {
    return <SetupWizard initialUserData={userData} />
  } else {
    return <ProfilePage userData={userData} />
  }
}
