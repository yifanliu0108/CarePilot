import { Link } from 'react-router-dom'

export default function CoverPage() {
  return (
    <div className="cp-cover">
      <div className="cp-cover__panel">
        <p className="cp-cover__lede">
          CarePilot helps you navigate care with clarity. Share how you are feeling, get a
          structured summary of next steps, and follow a plan that adapts as your situation
          changes—all in one calm workspace.
        </p>
        <p className="cp-cover__meta">
          Your chat will be powered by Gemini. Automated browser tasks you approve can run
          in the Live Actions panel via BrowserUse.
        </p>
        <Link to="/journey" className="cp-btn cp-btn--primary">
          Start your journey
        </Link>
      </div>
    </div>
  )
}
