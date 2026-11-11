// Chrome honors touch-action on HTML boxes and on an <svg> itself, but not
// on the shapes inside one, so the template's `touch-action: none` on a
// draggable shape does not stop a phone from scrolling the page mid-drag.
// An HTML element inside the draggable group does.
export default function TouchPad() {
  return <div className="mn-sim-touchpad" />
}
