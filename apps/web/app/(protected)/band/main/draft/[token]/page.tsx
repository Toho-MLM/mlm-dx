import { BandMainDraftBoard } from './band-main-draft-board'

export default function Page({ params }: { params: { token: string } }) {
  return <BandMainDraftBoard token={params.token} />
}
