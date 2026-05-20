// Attribution footer matching the one rendered by `/moonshine:shine`
// articles (see plugins/moonshine/ARTICLE.md). Sits at the very bottom
// of every page so the shared identity reads at a glance.
export default function MoonshineFooter() {
  return (
    <footer className="moonshine-footer">
      <p>
        Built with{' '}
        <a href="https://github.com/enjalot/moonshine">moonshine</a>.
      </p>
    </footer>
  )
}
