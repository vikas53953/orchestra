// C6 Loading skeleton: the session's shape while sessionGet is pending.
export function Loading() {
  return (
    <div className="o-col o-loading" aria-busy="true">
      <div className="o-sh">
        <span className="o-sk" style={{ width: '46%', height: 24 }} />
        <span className="o-sk" style={{ width: '32%', height: 14 }} />
      </div>
      <span className="o-sk" style={{ width: '42%', height: 40, alignSelf: 'flex-end', borderRadius: 18 }} />
      <div className="o-crew">
        {[0, 1, 2].map((i) => (
          <div key={i} className="o-sk-lane"><span className="o-sk" style={{ width: 22, height: 22, borderRadius: 6 }} /><span className="o-sk" style={{ width: 84, height: 12 }} /><span className="o-sk" style={{ width: `${40 - i * 8}%`, height: 12 }} /></div>
        ))}
      </div>
    </div>
  );
}
