/**
 * Host half of the done-beep bundle.
 *
 * The audible behaviour lives entirely in the browser module (`./client`),
 * which watches the Session snapshot of the conversation on screen. The Host
 * row exists so the bundle can be installed, listed, and toggled like any
 * other plugin; it registers no Host resource.
 */
export function apply() {}
