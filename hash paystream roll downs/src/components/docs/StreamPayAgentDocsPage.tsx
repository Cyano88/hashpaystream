import StreamPayAgentDocs from '../StreamPayAgentDocs'
import { StreamPayDocsShell } from './StreamPayDocsShell'

export default function StreamPayAgentDocsPage() {
  return (
    <StreamPayDocsShell active="/docs/agents">
      <StreamPayAgentDocs embedded />
    </StreamPayDocsShell>
  )
}
