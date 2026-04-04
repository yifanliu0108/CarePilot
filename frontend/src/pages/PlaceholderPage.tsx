import { Link } from 'react-router-dom'

type Props = { title: string }

export default function PlaceholderPage({ title }: Props) {
  return (
    <div className="cp-placeholder">
      <h1 className="cp-placeholder__title">{title}</h1>
      <p className="cp-placeholder__text">
        This section will hold your {title.toLowerCase()} experience. Use the sidebar to
        explore other areas, or start the guided journey from Home.
      </p>
      <Link to="/journey" className="cp-btn cp-btn--secondary">
        Open LiveActions / journey
      </Link>
    </div>
  )
}
