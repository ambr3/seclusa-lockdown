/*
 * Movement + optional manual aim.
 * Auto-aim mode: WASD/arrows or one stick; Space / FIRE pad to shoot.
 * Manual mode: mouse or right stick aims; click / Space / aim-stick to shoot.
 */

(function () {
  "use strict";

  var keys = Object.create(null);
  var pressed = Object.create(null);
  var mouse = { x: 0, y: 0, down: false, inside: false };
  var moveStick = { active: false, id: null, ox: 0, oy: 0, x: 0, y: 0, dx: 0, dy: 0 };
  var aimStick = { active: false, id: null, ox: 0, oy: 0, x: 0, y: 0, dx: 0, dy: 0 };
  var firePad = { active: false, id: null };
  var touchMode = false;
  var surface = null;
  var maxRadius = 64;
  var enabled = true;
  var autoAim = true;

  function clampStick(stick) {
    var dx = stick.x - stick.ox;
    var dy = stick.y - stick.oy;
    var len = Math.hypot(dx, dy);
    if (len > maxRadius && len > 0) {
      dx = (dx / len) * maxRadius;
      dy = (dy / len) * maxRadius;
      stick.x = stick.ox + dx;
      stick.y = stick.oy + dy;
      len = maxRadius;
    }
    if (len < 10) {
      stick.dx = 0;
      stick.dy = 0;
    } else {
      stick.dx = dx / maxRadius;
      stick.dy = dy / maxRadius;
    }
  }

  function resetStick(stick) {
    stick.active = false;
    stick.id = null;
    stick.dx = 0;
    stick.dy = 0;
  }

  function localPoint(event) {
    var rect = surface.getBoundingClientRect();
    var scaleX = surface.width / Math.max(1, rect.width);
    var scaleY = surface.height / Math.max(1, rect.height);
    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
      w: surface.width,
      h: surface.height
    };
  }

  function inFirePad(p) {
    return p.x > p.w * 0.62 && p.y > p.h * 0.58;
  }

  function isTouchLike(event) {
    return event.pointerType === "touch" || event.pointerType === "pen";
  }

  function onKeyDown(event) {
    var code = event.code;
    if (
      code === "KeyW" || code === "KeyA" || code === "KeyS" || code === "KeyD" ||
      code === "ArrowUp" || code === "ArrowDown" || code === "ArrowLeft" || code === "ArrowRight" ||
      code === "Space" || code === "KeyE" || code === "KeyP" || code === "KeyF" ||
      code === "ShiftLeft" || code === "ShiftRight" ||
      code === "Digit1" || code === "Digit2" || code === "Digit3" || code === "Digit4" ||
      code === "Numpad1" || code === "Numpad2" || code === "Numpad3" || code === "Numpad4"
    ) {
      event.preventDefault();
    }
    if (!keys[code]) pressed[code] = true;
    keys[code] = true;
  }

  function onKeyUp(event) {
    keys[event.code] = false;
  }

  function consume(code) {
    if (!pressed[code]) return false;
    delete pressed[code];
    return true;
  }

  function startStick(stick, event, p) {
    if (stick.active) return false;
    stick.active = true;
    stick.id = event.pointerId;
    stick.ox = p.x;
    stick.oy = p.y;
    stick.x = p.x;
    stick.y = p.y;
    stick.dx = 0;
    stick.dy = 0;
    try { surface.setPointerCapture(event.pointerId); } catch (err) { /* ignore */ }
    return true;
  }

  function onPointerDown(event) {
    if (!surface || !enabled) return;
    var p = localPoint(event);
    mouse.x = p.x;
    mouse.y = p.y;
    mouse.inside = true;

    if (isTouchLike(event)) {
      touchMode = true;
      event.preventDefault();

      if (autoAim) {
        if (inFirePad(p) && !firePad.active) {
          firePad.active = true;
          firePad.id = event.pointerId;
          try { surface.setPointerCapture(event.pointerId); } catch (err) { /* ignore */ }
          return;
        }
        startStick(moveStick, event, p);
        return;
      }

      // Manual: left half move, right half aim/fire
      if (p.x < p.w * 0.5) startStick(moveStick, event, p);
      else startStick(aimStick, event, p);
      return;
    }

    mouse.down = true;
  }

  function onPointerMove(event) {
    if (!surface) return;
    var p = localPoint(event);
    mouse.x = p.x;
    mouse.y = p.y;
    mouse.inside = true;

    if (moveStick.active && moveStick.id === event.pointerId) {
      event.preventDefault();
      moveStick.x = p.x;
      moveStick.y = p.y;
      clampStick(moveStick);
      return;
    }
    if (aimStick.active && aimStick.id === event.pointerId) {
      event.preventDefault();
      aimStick.x = p.x;
      aimStick.y = p.y;
      clampStick(aimStick);
    }
  }

  function onPointerUp(event) {
    if (!surface) return;
    if (firePad.active && firePad.id === event.pointerId) {
      firePad.active = false;
      firePad.id = null;
      return;
    }
    if (moveStick.active && moveStick.id === event.pointerId) {
      resetStick(moveStick);
      return;
    }
    if (aimStick.active && aimStick.id === event.pointerId) {
      resetStick(aimStick);
      return;
    }
    if (event.pointerType === "mouse" || event.pointerType === "") {
      mouse.down = false;
    }
  }

  function onPointerLeave(event) {
    if (event.pointerType === "mouse") {
      mouse.inside = false;
      mouse.down = false;
    }
  }

  function onContextMenu(event) {
    event.preventDefault();
  }

  function keyboardMove() {
    var x = 0;
    var y = 0;
    if (keys.KeyA || keys.ArrowLeft) x -= 1;
    if (keys.KeyD || keys.ArrowRight) x += 1;
    if (keys.KeyW || keys.ArrowUp) y -= 1;
    if (keys.KeyS || keys.ArrowDown) y += 1;
    var len = Math.hypot(x, y);
    if (len > 0) {
      x /= len;
      y /= len;
    }
    return { x: x, y: y };
  }

  function attach(el) {
    detach();
    surface = el;
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    surface.addEventListener("pointerdown", onPointerDown);
    surface.addEventListener("pointermove", onPointerMove);
    surface.addEventListener("pointerup", onPointerUp);
    surface.addEventListener("pointercancel", onPointerUp);
    surface.addEventListener("pointerleave", onPointerLeave);
    surface.addEventListener("contextmenu", onContextMenu);
  }

  function detach() {
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    if (surface) {
      surface.removeEventListener("pointerdown", onPointerDown);
      surface.removeEventListener("pointermove", onPointerMove);
      surface.removeEventListener("pointerup", onPointerUp);
      surface.removeEventListener("pointercancel", onPointerUp);
      surface.removeEventListener("pointerleave", onPointerLeave);
      surface.removeEventListener("contextmenu", onContextMenu);
    }
    surface = null;
    resetStick(moveStick);
    resetStick(aimStick);
    firePad.active = false;
    firePad.id = null;
    mouse.down = false;
    keys = Object.create(null);
  }

  /** @param {number} [playerX] screen-space player x (manual mouse aim)
   *  @param {number} [playerY] screen-space player y */
  function getState(playerX, playerY) {
    var move = keyboardMove();
    if (moveStick.active) {
      move = { x: moveStick.dx, y: moveStick.dy };
    }

    var aimX = 0;
    var aimY = 0;
    var hasAim = false;
    var shooting = !!keys.Space || firePad.active;

    if (!autoAim) {
      if (aimStick.active) {
        var alen = Math.hypot(aimStick.dx, aimStick.dy);
        if (alen > 0.15) {
          aimX = aimStick.dx;
          aimY = aimStick.dy;
          hasAim = true;
          shooting = true;
        }
      } else if (mouse.inside || mouse.down) {
        var px = playerX == null ? 0 : playerX;
        var py = playerY == null ? 0 : playerY;
        aimX = mouse.x - px;
        aimY = mouse.y - py;
        var mlen = Math.hypot(aimX, aimY);
        if (mlen > 0.001) {
          aimX /= mlen;
          aimY /= mlen;
          hasAim = true;
        }
        if (mouse.down) shooting = true;
      }
    }

    var interact = consume("KeyE");
    var interactHeld = !!keys.KeyE;
    var dash = consume("ShiftLeft") || consume("ShiftRight");
    var breach = consume("KeyF");
    var pause = consume("KeyP");
    var weapon1 = consume("Digit1") || consume("Numpad1");
    var weapon2 = consume("Digit2") || consume("Numpad2");
    var weapon3 = consume("Digit3") || consume("Numpad3");

    return {
      moveX: move.x,
      moveY: move.y,
      aimX: aimX,
      aimY: aimY,
      hasAim: hasAim,
      shooting: shooting,
      autoAim: autoAim,
      interact: interact,
      interactHeld: interactHeld,
      dash: dash,
      breach: breach,
      pause: pause,
      weapon1: weapon1,
      weapon2: weapon2,
      weapon3: weapon3,
      touchMode: touchMode || moveStick.active || aimStick.active || firePad.active,
      moveStick: {
        active: moveStick.active,
        ox: moveStick.ox,
        oy: moveStick.oy,
        x: moveStick.x,
        y: moveStick.y
      },
      aimStick: {
        active: aimStick.active,
        ox: aimStick.ox,
        oy: aimStick.oy,
        x: aimStick.x,
        y: aimStick.y
      },
      firePadActive: firePad.active,
      stickRadius: maxRadius
    };
  }

  function preferTouchChrome() {
    try {
      return !!(window.matchMedia && window.matchMedia("(pointer: coarse)").matches);
    } catch (err) {
      return false;
    }
  }

  window.GameInput = {
    attach: attach,
    detach: detach,
    getState: getState,
    preferTouchChrome: preferTouchChrome,
    setEnabled: function (value) { enabled = !!value; },
    setAutoAim: function (value) {
      autoAim = !!value;
      resetStick(aimStick);
      firePad.active = false;
      firePad.id = null;
    },
    getAutoAim: function () { return autoAim; },
    markTouch: function () { touchMode = true; }
  };
})();
