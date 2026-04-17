type AdminPagePlaceholderProps = {
  title: string;
  description: string;
  endpoints: string[];
  notes?: string[];
};

export default function AdminPagePlaceholder({
  title,
  description,
  endpoints,
  notes = [],
}: AdminPagePlaceholderProps) {
  return (
    <div className="placeholder-page">
      <div className="card">
        <div className="card-header">
          <h2>{title}</h2>
        </div>
        <p className="muted-copy">{description}</p>
      </div>

      <div className="card">
        <div className="card-header">
          <h3>Expected Backend Endpoints</h3>
        </div>
        <ul className="endpoint-list">
          {endpoints.map((endpoint) => (
            <li key={endpoint}>
              <code>{endpoint}</code>
            </li>
          ))}
        </ul>
      </div>

      {notes.length > 0 && (
        <div className="card">
          <div className="card-header">
            <h3>Integration Notes</h3>
          </div>
          <ul className="notes-list">
            {notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
