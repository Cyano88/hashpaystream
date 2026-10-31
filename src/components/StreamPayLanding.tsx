import {usePrivy} from '@privy-io/react-auth'
import {Navigate} from '../lib/router'
import {AgreementSignInLanding} from './agreements/AgreementSignInLanding'
export default function StreamPayLanding(){const {authenticated}=usePrivy();return authenticated?<Navigate to="/trade" replace/>:<div className="mx-auto flex min-h-[80dvh] w-full max-w-md items-center px-5"><AgreementSignInLanding compact/></div>}
