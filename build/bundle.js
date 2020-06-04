var app = (function () {
    'use strict';

    function noop() { }
    const identity = x => x;
    function assign(tar, src) {
        // @ts-ignore
        for (const k in src)
            tar[k] = src[k];
        return tar;
    }
    function run(fn) {
        return fn();
    }
    function blank_object() {
        return Object.create(null);
    }
    function run_all(fns) {
        fns.forEach(run);
    }
    function is_function(thing) {
        return typeof thing === 'function';
    }
    function safe_not_equal(a, b) {
        return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
    }
    function create_slot(definition, ctx, $$scope, fn) {
        if (definition) {
            const slot_ctx = get_slot_context(definition, ctx, $$scope, fn);
            return definition[0](slot_ctx);
        }
    }
    function get_slot_context(definition, ctx, $$scope, fn) {
        return definition[1] && fn
            ? assign($$scope.ctx.slice(), definition[1](fn(ctx)))
            : $$scope.ctx;
    }
    function get_slot_changes(definition, $$scope, dirty, fn) {
        if (definition[2] && fn) {
            const lets = definition[2](fn(dirty));
            if ($$scope.dirty === undefined) {
                return lets;
            }
            if (typeof lets === 'object') {
                const merged = [];
                const len = Math.max($$scope.dirty.length, lets.length);
                for (let i = 0; i < len; i += 1) {
                    merged[i] = $$scope.dirty[i] | lets[i];
                }
                return merged;
            }
            return $$scope.dirty | lets;
        }
        return $$scope.dirty;
    }
    function update_slot(slot, slot_definition, ctx, $$scope, dirty, get_slot_changes_fn, get_slot_context_fn) {
        const slot_changes = get_slot_changes(slot_definition, $$scope, dirty, get_slot_changes_fn);
        if (slot_changes) {
            const slot_context = get_slot_context(slot_definition, ctx, $$scope, get_slot_context_fn);
            slot.p(slot_context, slot_changes);
        }
    }

    const is_client = typeof window !== 'undefined';
    let now = is_client
        ? () => window.performance.now()
        : () => Date.now();
    let raf = is_client ? cb => requestAnimationFrame(cb) : noop;

    const tasks = new Set();
    function run_tasks(now) {
        tasks.forEach(task => {
            if (!task.c(now)) {
                tasks.delete(task);
                task.f();
            }
        });
        if (tasks.size !== 0)
            raf(run_tasks);
    }
    /**
     * Creates a new task that runs on each raf frame
     * until it returns a falsy value or is aborted
     */
    function loop(callback) {
        let task;
        if (tasks.size === 0)
            raf(run_tasks);
        return {
            promise: new Promise(fulfill => {
                tasks.add(task = { c: callback, f: fulfill });
            }),
            abort() {
                tasks.delete(task);
            }
        };
    }

    function append(target, node) {
        target.appendChild(node);
    }
    function insert(target, node, anchor) {
        target.insertBefore(node, anchor || null);
    }
    function detach(node) {
        node.parentNode.removeChild(node);
    }
    function element(name) {
        return document.createElement(name);
    }
    function text(data) {
        return document.createTextNode(data);
    }
    function space() {
        return text(' ');
    }
    function listen(node, event, handler, options) {
        node.addEventListener(event, handler, options);
        return () => node.removeEventListener(event, handler, options);
    }
    function prevent_default(fn) {
        return function (event) {
            event.preventDefault();
            // @ts-ignore
            return fn.call(this, event);
        };
    }
    function attr(node, attribute, value) {
        if (value == null)
            node.removeAttribute(attribute);
        else if (node.getAttribute(attribute) !== value)
            node.setAttribute(attribute, value);
    }
    function to_number(value) {
        return value === '' ? undefined : +value;
    }
    function children(element) {
        return Array.from(element.childNodes);
    }
    function set_data(text, data) {
        data = '' + data;
        if (text.data !== data)
            text.data = data;
    }
    function set_input_value(input, value) {
        input.value = value == null ? '' : value;
    }
    function toggle_class(element, name, toggle) {
        element.classList[toggle ? 'add' : 'remove'](name);
    }
    function custom_event(type, detail) {
        const e = document.createEvent('CustomEvent');
        e.initCustomEvent(type, false, false, detail);
        return e;
    }

    const active_docs = new Set();
    let active = 0;
    // https://github.com/darkskyapp/string-hash/blob/master/index.js
    function hash(str) {
        let hash = 5381;
        let i = str.length;
        while (i--)
            hash = ((hash << 5) - hash) ^ str.charCodeAt(i);
        return hash >>> 0;
    }
    function create_rule(node, a, b, duration, delay, ease, fn, uid = 0) {
        const step = 16.666 / duration;
        let keyframes = '{\n';
        for (let p = 0; p <= 1; p += step) {
            const t = a + (b - a) * ease(p);
            keyframes += p * 100 + `%{${fn(t, 1 - t)}}\n`;
        }
        const rule = keyframes + `100% {${fn(b, 1 - b)}}\n}`;
        const name = `__svelte_${hash(rule)}_${uid}`;
        const doc = node.ownerDocument;
        active_docs.add(doc);
        const stylesheet = doc.__svelte_stylesheet || (doc.__svelte_stylesheet = doc.head.appendChild(element('style')).sheet);
        const current_rules = doc.__svelte_rules || (doc.__svelte_rules = {});
        if (!current_rules[name]) {
            current_rules[name] = true;
            stylesheet.insertRule(`@keyframes ${name} ${rule}`, stylesheet.cssRules.length);
        }
        const animation = node.style.animation || '';
        node.style.animation = `${animation ? `${animation}, ` : ``}${name} ${duration}ms linear ${delay}ms 1 both`;
        active += 1;
        return name;
    }
    function delete_rule(node, name) {
        const previous = (node.style.animation || '').split(', ');
        const next = previous.filter(name
            ? anim => anim.indexOf(name) < 0 // remove specific animation
            : anim => anim.indexOf('__svelte') === -1 // remove all Svelte animations
        );
        const deleted = previous.length - next.length;
        if (deleted) {
            node.style.animation = next.join(', ');
            active -= deleted;
            if (!active)
                clear_rules();
        }
    }
    function clear_rules() {
        raf(() => {
            if (active)
                return;
            active_docs.forEach(doc => {
                const stylesheet = doc.__svelte_stylesheet;
                let i = stylesheet.cssRules.length;
                while (i--)
                    stylesheet.deleteRule(i);
                doc.__svelte_rules = {};
            });
            active_docs.clear();
        });
    }

    function create_animation(node, from, fn, params) {
        if (!from)
            return noop;
        const to = node.getBoundingClientRect();
        if (from.left === to.left && from.right === to.right && from.top === to.top && from.bottom === to.bottom)
            return noop;
        const { delay = 0, duration = 300, easing = identity, 
        // @ts-ignore todo: should this be separated from destructuring? Or start/end added to public api and documentation?
        start: start_time = now() + delay, 
        // @ts-ignore todo:
        end = start_time + duration, tick = noop, css } = fn(node, { from, to }, params);
        let running = true;
        let started = false;
        let name;
        function start() {
            if (css) {
                name = create_rule(node, 0, 1, duration, delay, easing, css);
            }
            if (!delay) {
                started = true;
            }
        }
        function stop() {
            if (css)
                delete_rule(node, name);
            running = false;
        }
        loop(now => {
            if (!started && now >= start_time) {
                started = true;
            }
            if (started && now >= end) {
                tick(1, 0);
                stop();
            }
            if (!running) {
                return false;
            }
            if (started) {
                const p = now - start_time;
                const t = 0 + 1 * easing(p / duration);
                tick(t, 1 - t);
            }
            return true;
        });
        start();
        tick(0, 1);
        return stop;
    }
    function fix_position(node) {
        const style = getComputedStyle(node);
        if (style.position !== 'absolute' && style.position !== 'fixed') {
            const { width, height } = style;
            const a = node.getBoundingClientRect();
            node.style.position = 'absolute';
            node.style.width = width;
            node.style.height = height;
            add_transform(node, a);
        }
    }
    function add_transform(node, a) {
        const b = node.getBoundingClientRect();
        if (a.left !== b.left || a.top !== b.top) {
            const style = getComputedStyle(node);
            const transform = style.transform === 'none' ? '' : style.transform;
            node.style.transform = `${transform} translate(${a.left - b.left}px, ${a.top - b.top}px)`;
        }
    }

    let current_component;
    function set_current_component(component) {
        current_component = component;
    }
    function get_current_component() {
        if (!current_component)
            throw new Error(`Function called outside component initialization`);
        return current_component;
    }
    function onMount(fn) {
        get_current_component().$$.on_mount.push(fn);
    }
    function afterUpdate(fn) {
        get_current_component().$$.after_update.push(fn);
    }
    function setContext(key, context) {
        get_current_component().$$.context.set(key, context);
    }
    function getContext(key) {
        return get_current_component().$$.context.get(key);
    }

    const dirty_components = [];
    const binding_callbacks = [];
    const render_callbacks = [];
    const flush_callbacks = [];
    const resolved_promise = Promise.resolve();
    let update_scheduled = false;
    function schedule_update() {
        if (!update_scheduled) {
            update_scheduled = true;
            resolved_promise.then(flush);
        }
    }
    function add_render_callback(fn) {
        render_callbacks.push(fn);
    }
    let flushing = false;
    const seen_callbacks = new Set();
    function flush() {
        if (flushing)
            return;
        flushing = true;
        do {
            // first, call beforeUpdate functions
            // and update components
            for (let i = 0; i < dirty_components.length; i += 1) {
                const component = dirty_components[i];
                set_current_component(component);
                update(component.$$);
            }
            dirty_components.length = 0;
            while (binding_callbacks.length)
                binding_callbacks.pop()();
            // then, once components are updated, call
            // afterUpdate functions. This may cause
            // subsequent updates...
            for (let i = 0; i < render_callbacks.length; i += 1) {
                const callback = render_callbacks[i];
                if (!seen_callbacks.has(callback)) {
                    // ...so guard against infinite loops
                    seen_callbacks.add(callback);
                    callback();
                }
            }
            render_callbacks.length = 0;
        } while (dirty_components.length);
        while (flush_callbacks.length) {
            flush_callbacks.pop()();
        }
        update_scheduled = false;
        flushing = false;
        seen_callbacks.clear();
    }
    function update($$) {
        if ($$.fragment !== null) {
            $$.update();
            run_all($$.before_update);
            const dirty = $$.dirty;
            $$.dirty = [-1];
            $$.fragment && $$.fragment.p($$.ctx, dirty);
            $$.after_update.forEach(add_render_callback);
        }
    }

    let promise;
    function wait() {
        if (!promise) {
            promise = Promise.resolve();
            promise.then(() => {
                promise = null;
            });
        }
        return promise;
    }
    function dispatch(node, direction, kind) {
        node.dispatchEvent(custom_event(`${direction ? 'intro' : 'outro'}${kind}`));
    }
    const outroing = new Set();
    let outros;
    function group_outros() {
        outros = {
            r: 0,
            c: [],
            p: outros // parent group
        };
    }
    function check_outros() {
        if (!outros.r) {
            run_all(outros.c);
        }
        outros = outros.p;
    }
    function transition_in(block, local) {
        if (block && block.i) {
            outroing.delete(block);
            block.i(local);
        }
    }
    function transition_out(block, local, detach, callback) {
        if (block && block.o) {
            if (outroing.has(block))
                return;
            outroing.add(block);
            outros.c.push(() => {
                outroing.delete(block);
                if (callback) {
                    if (detach)
                        block.d(1);
                    callback();
                }
            });
            block.o(local);
        }
    }
    const null_transition = { duration: 0 };
    function create_in_transition(node, fn, params) {
        let config = fn(node, params);
        let running = false;
        let animation_name;
        let task;
        let uid = 0;
        function cleanup() {
            if (animation_name)
                delete_rule(node, animation_name);
        }
        function go() {
            const { delay = 0, duration = 300, easing = identity, tick = noop, css } = config || null_transition;
            if (css)
                animation_name = create_rule(node, 0, 1, duration, delay, easing, css, uid++);
            tick(0, 1);
            const start_time = now() + delay;
            const end_time = start_time + duration;
            if (task)
                task.abort();
            running = true;
            add_render_callback(() => dispatch(node, true, 'start'));
            task = loop(now => {
                if (running) {
                    if (now >= end_time) {
                        tick(1, 0);
                        dispatch(node, true, 'end');
                        cleanup();
                        return running = false;
                    }
                    if (now >= start_time) {
                        const t = easing((now - start_time) / duration);
                        tick(t, 1 - t);
                    }
                }
                return running;
            });
        }
        let started = false;
        return {
            start() {
                if (started)
                    return;
                delete_rule(node);
                if (is_function(config)) {
                    config = config();
                    wait().then(go);
                }
                else {
                    go();
                }
            },
            invalidate() {
                started = false;
            },
            end() {
                if (running) {
                    cleanup();
                    running = false;
                }
            }
        };
    }
    function create_out_transition(node, fn, params) {
        let config = fn(node, params);
        let running = true;
        let animation_name;
        const group = outros;
        group.r += 1;
        function go() {
            const { delay = 0, duration = 300, easing = identity, tick = noop, css } = config || null_transition;
            if (css)
                animation_name = create_rule(node, 1, 0, duration, delay, easing, css);
            const start_time = now() + delay;
            const end_time = start_time + duration;
            add_render_callback(() => dispatch(node, false, 'start'));
            loop(now => {
                if (running) {
                    if (now >= end_time) {
                        tick(0, 1);
                        dispatch(node, false, 'end');
                        if (!--group.r) {
                            // this will result in `end()` being called,
                            // so we don't need to clean up here
                            run_all(group.c);
                        }
                        return false;
                    }
                    if (now >= start_time) {
                        const t = easing((now - start_time) / duration);
                        tick(1 - t, t);
                    }
                }
                return running;
            });
        }
        if (is_function(config)) {
            wait().then(() => {
                // @ts-ignore
                config = config();
                go();
            });
        }
        else {
            go();
        }
        return {
            end(reset) {
                if (reset && config.tick) {
                    config.tick(1, 0);
                }
                if (running) {
                    if (animation_name)
                        delete_rule(node, animation_name);
                    running = false;
                }
            }
        };
    }
    function create_bidirectional_transition(node, fn, params, intro) {
        let config = fn(node, params);
        let t = intro ? 0 : 1;
        let running_program = null;
        let pending_program = null;
        let animation_name = null;
        function clear_animation() {
            if (animation_name)
                delete_rule(node, animation_name);
        }
        function init(program, duration) {
            const d = program.b - t;
            duration *= Math.abs(d);
            return {
                a: t,
                b: program.b,
                d,
                duration,
                start: program.start,
                end: program.start + duration,
                group: program.group
            };
        }
        function go(b) {
            const { delay = 0, duration = 300, easing = identity, tick = noop, css } = config || null_transition;
            const program = {
                start: now() + delay,
                b
            };
            if (!b) {
                // @ts-ignore todo: improve typings
                program.group = outros;
                outros.r += 1;
            }
            if (running_program) {
                pending_program = program;
            }
            else {
                // if this is an intro, and there's a delay, we need to do
                // an initial tick and/or apply CSS animation immediately
                if (css) {
                    clear_animation();
                    animation_name = create_rule(node, t, b, duration, delay, easing, css);
                }
                if (b)
                    tick(0, 1);
                running_program = init(program, duration);
                add_render_callback(() => dispatch(node, b, 'start'));
                loop(now => {
                    if (pending_program && now > pending_program.start) {
                        running_program = init(pending_program, duration);
                        pending_program = null;
                        dispatch(node, running_program.b, 'start');
                        if (css) {
                            clear_animation();
                            animation_name = create_rule(node, t, running_program.b, running_program.duration, 0, easing, config.css);
                        }
                    }
                    if (running_program) {
                        if (now >= running_program.end) {
                            tick(t = running_program.b, 1 - t);
                            dispatch(node, running_program.b, 'end');
                            if (!pending_program) {
                                // we're done
                                if (running_program.b) {
                                    // intro — we can tidy up immediately
                                    clear_animation();
                                }
                                else {
                                    // outro — needs to be coordinated
                                    if (!--running_program.group.r)
                                        run_all(running_program.group.c);
                                }
                            }
                            running_program = null;
                        }
                        else if (now >= running_program.start) {
                            const p = now - running_program.start;
                            t = running_program.a + running_program.d * easing(p / running_program.duration);
                            tick(t, 1 - t);
                        }
                    }
                    return !!(running_program || pending_program);
                });
            }
        }
        return {
            run(b) {
                if (is_function(config)) {
                    wait().then(() => {
                        // @ts-ignore
                        config = config();
                        go(b);
                    });
                }
                else {
                    go(b);
                }
            },
            end() {
                clear_animation();
                running_program = pending_program = null;
            }
        };
    }
    function outro_and_destroy_block(block, lookup) {
        transition_out(block, 1, 1, () => {
            lookup.delete(block.key);
        });
    }
    function fix_and_outro_and_destroy_block(block, lookup) {
        block.f();
        outro_and_destroy_block(block, lookup);
    }
    function update_keyed_each(old_blocks, dirty, get_key, dynamic, ctx, list, lookup, node, destroy, create_each_block, next, get_context) {
        let o = old_blocks.length;
        let n = list.length;
        let i = o;
        const old_indexes = {};
        while (i--)
            old_indexes[old_blocks[i].key] = i;
        const new_blocks = [];
        const new_lookup = new Map();
        const deltas = new Map();
        i = n;
        while (i--) {
            const child_ctx = get_context(ctx, list, i);
            const key = get_key(child_ctx);
            let block = lookup.get(key);
            if (!block) {
                block = create_each_block(key, child_ctx);
                block.c();
            }
            else if (dynamic) {
                block.p(child_ctx, dirty);
            }
            new_lookup.set(key, new_blocks[i] = block);
            if (key in old_indexes)
                deltas.set(key, Math.abs(i - old_indexes[key]));
        }
        const will_move = new Set();
        const did_move = new Set();
        function insert(block) {
            transition_in(block, 1);
            block.m(node, next);
            lookup.set(block.key, block);
            next = block.first;
            n--;
        }
        while (o && n) {
            const new_block = new_blocks[n - 1];
            const old_block = old_blocks[o - 1];
            const new_key = new_block.key;
            const old_key = old_block.key;
            if (new_block === old_block) {
                // do nothing
                next = new_block.first;
                o--;
                n--;
            }
            else if (!new_lookup.has(old_key)) {
                // remove old block
                destroy(old_block, lookup);
                o--;
            }
            else if (!lookup.has(new_key) || will_move.has(new_key)) {
                insert(new_block);
            }
            else if (did_move.has(old_key)) {
                o--;
            }
            else if (deltas.get(new_key) > deltas.get(old_key)) {
                did_move.add(new_key);
                insert(new_block);
            }
            else {
                will_move.add(old_key);
                o--;
            }
        }
        while (o--) {
            const old_block = old_blocks[o];
            if (!new_lookup.has(old_block.key))
                destroy(old_block, lookup);
        }
        while (n)
            insert(new_blocks[n - 1]);
        return new_blocks;
    }

    function get_spread_update(levels, updates) {
        const update = {};
        const to_null_out = {};
        const accounted_for = { $$scope: 1 };
        let i = levels.length;
        while (i--) {
            const o = levels[i];
            const n = updates[i];
            if (n) {
                for (const key in o) {
                    if (!(key in n))
                        to_null_out[key] = 1;
                }
                for (const key in n) {
                    if (!accounted_for[key]) {
                        update[key] = n[key];
                        accounted_for[key] = 1;
                    }
                }
                levels[i] = n;
            }
            else {
                for (const key in o) {
                    accounted_for[key] = 1;
                }
            }
        }
        for (const key in to_null_out) {
            if (!(key in update))
                update[key] = undefined;
        }
        return update;
    }
    function get_spread_object(spread_props) {
        return typeof spread_props === 'object' && spread_props !== null ? spread_props : {};
    }
    function create_component(block) {
        block && block.c();
    }
    function mount_component(component, target, anchor) {
        const { fragment, on_mount, on_destroy, after_update } = component.$$;
        fragment && fragment.m(target, anchor);
        // onMount happens before the initial afterUpdate
        add_render_callback(() => {
            const new_on_destroy = on_mount.map(run).filter(is_function);
            if (on_destroy) {
                on_destroy.push(...new_on_destroy);
            }
            else {
                // Edge case - component was destroyed immediately,
                // most likely as a result of a binding initialising
                run_all(new_on_destroy);
            }
            component.$$.on_mount = [];
        });
        after_update.forEach(add_render_callback);
    }
    function destroy_component(component, detaching) {
        const $$ = component.$$;
        if ($$.fragment !== null) {
            run_all($$.on_destroy);
            $$.fragment && $$.fragment.d(detaching);
            // TODO null out other refs, including component.$$ (but need to
            // preserve final state?)
            $$.on_destroy = $$.fragment = null;
            $$.ctx = [];
        }
    }
    function make_dirty(component, i) {
        if (component.$$.dirty[0] === -1) {
            dirty_components.push(component);
            schedule_update();
            component.$$.dirty.fill(0);
        }
        component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
    }
    function init(component, options, instance, create_fragment, not_equal, props, dirty = [-1]) {
        const parent_component = current_component;
        set_current_component(component);
        const prop_values = options.props || {};
        const $$ = component.$$ = {
            fragment: null,
            ctx: null,
            // state
            props,
            update: noop,
            not_equal,
            bound: blank_object(),
            // lifecycle
            on_mount: [],
            on_destroy: [],
            before_update: [],
            after_update: [],
            context: new Map(parent_component ? parent_component.$$.context : []),
            // everything else
            callbacks: blank_object(),
            dirty
        };
        let ready = false;
        $$.ctx = instance
            ? instance(component, prop_values, (i, ret, ...rest) => {
                const value = rest.length ? rest[0] : ret;
                if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                    if ($$.bound[i])
                        $$.bound[i](value);
                    if (ready)
                        make_dirty(component, i);
                }
                return ret;
            })
            : [];
        $$.update();
        ready = true;
        run_all($$.before_update);
        // `false` as a special case of no DOM component
        $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
        if (options.target) {
            if (options.hydrate) {
                const nodes = children(options.target);
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.l(nodes);
                nodes.forEach(detach);
            }
            else {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.c();
            }
            if (options.intro)
                transition_in(component.$$.fragment);
            mount_component(component, options.target, options.anchor);
            flush();
        }
        set_current_component(parent_component);
    }
    class SvelteComponent {
        $destroy() {
            destroy_component(this, 1);
            this.$destroy = noop;
        }
        $on(type, callback) {
            const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
            callbacks.push(callback);
            return () => {
                const index = callbacks.indexOf(callback);
                if (index !== -1)
                    callbacks.splice(index, 1);
            };
        }
        $set() {
            // overridden by instance, if it has props
        }
    }

    /* src/Navbar.svelte generated by Svelte v3.23.0 */

    function create_fragment(ctx) {
    	let nav;
    	let div;
    	let t1;
    	let button;
    	let mounted;
    	let dispose;

    	return {
    		c() {
    			nav = element("nav");
    			div = element("div");
    			div.innerHTML = `<h1 class="nav-title">Budget Calculator</h1>`;
    			t1 = space();
    			button = element("button");

    			button.innerHTML = `<i class="far fa-plus-square"></i>
add item
`;

    			attr(div, "class", "nav-center");
    			attr(button, "type", "button");
    			attr(button, "class", "nav-btn");
    			attr(nav, "class", "nav");
    		},
    		m(target, anchor) {
    			insert(target, nav, anchor);
    			append(nav, div);
    			append(nav, t1);
    			append(nav, button);

    			if (!mounted) {
    				dispose = listen(button, "click", function () {
    					if (is_function(/*showForm*/ ctx[0])) /*showForm*/ ctx[0].apply(this, arguments);
    				});

    				mounted = true;
    			}
    		},
    		p(new_ctx, [dirty]) {
    			ctx = new_ctx;
    		},
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(nav);
    			mounted = false;
    			dispose();
    		}
    	};
    }

    function instance($$self, $$props, $$invalidate) {
    	let { showForm } = $$props;

    	$$self.$set = $$props => {
    		if ("showForm" in $$props) $$invalidate(0, showForm = $$props.showForm);
    	};

    	return [showForm];
    }

    class Navbar extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance, create_fragment, safe_not_equal, { showForm: 0 });
    	}
    }

    /* src/Title.svelte generated by Svelte v3.23.0 */

    function create_fragment$1(ctx) {
    	let div;
    	let h2;
    	let t;

    	return {
    		c() {
    			div = element("div");
    			h2 = element("h2");
    			t = text(/*title*/ ctx[0]);
    			attr(div, "class", "main-title");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			append(div, h2);
    			append(h2, t);
    		},
    		p(ctx, [dirty]) {
    			if (dirty & /*title*/ 1) set_data(t, /*title*/ ctx[0]);
    		},
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(div);
    		}
    	};
    }

    function instance$1($$self, $$props, $$invalidate) {
    	let { title = "default title" } = $$props;

    	$$self.$set = $$props => {
    		if ("title" in $$props) $$invalidate(0, title = $$props.title);
    	};

    	return [title];
    }

    class Title extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$1, create_fragment$1, safe_not_equal, { title: 0 });
    	}
    }

    function cubicInOut(t) {
        return t < 0.5 ? 4.0 * t * t * t : 0.5 * Math.pow(2.0 * t - 2.0, 3.0) + 1.0;
    }
    function cubicOut(t) {
        const f = t - 1.0;
        return f * f * f + 1.0;
    }

    function blur(node, { delay = 0, duration = 400, easing = cubicInOut, amount = 5, opacity = 0 }) {
        const style = getComputedStyle(node);
        const target_opacity = +style.opacity;
        const f = style.filter === 'none' ? '' : style.filter;
        const od = target_opacity * (1 - opacity);
        return {
            delay,
            duration,
            easing,
            css: (_t, u) => `opacity: ${target_opacity - (od * u)}; filter: ${f} blur(${u * amount}px);`
        };
    }
    function fade(node, { delay = 0, duration = 400, easing = identity }) {
        const o = +getComputedStyle(node).opacity;
        return {
            delay,
            duration,
            easing,
            css: t => `opacity: ${t * o}`
        };
    }
    function fly(node, { delay = 0, duration = 400, easing = cubicOut, x = 0, y = 0, opacity = 0 }) {
        const style = getComputedStyle(node);
        const target_opacity = +style.opacity;
        const transform = style.transform === 'none' ? '' : style.transform;
        const od = target_opacity * (1 - opacity);
        return {
            delay,
            duration,
            easing,
            css: (t, u) => `
			transform: ${transform} translate(${(1 - t) * x}px, ${(1 - t) * y}px);
			opacity: ${target_opacity - (od * u)}`
        };
    }
    function slide(node, { delay = 0, duration = 400, easing = cubicOut }) {
        const style = getComputedStyle(node);
        const opacity = +style.opacity;
        const height = parseFloat(style.height);
        const padding_top = parseFloat(style.paddingTop);
        const padding_bottom = parseFloat(style.paddingBottom);
        const margin_top = parseFloat(style.marginTop);
        const margin_bottom = parseFloat(style.marginBottom);
        const border_top_width = parseFloat(style.borderTopWidth);
        const border_bottom_width = parseFloat(style.borderBottomWidth);
        return {
            delay,
            duration,
            easing,
            css: t => `overflow: hidden;` +
                `opacity: ${Math.min(t * 20, 1) * opacity};` +
                `height: ${t * height}px;` +
                `padding-top: ${t * padding_top}px;` +
                `padding-bottom: ${t * padding_bottom}px;` +
                `margin-top: ${t * margin_top}px;` +
                `margin-bottom: ${t * margin_bottom}px;` +
                `border-top-width: ${t * border_top_width}px;` +
                `border-bottom-width: ${t * border_bottom_width}px;`
        };
    }

    /* src/Expense.svelte generated by Svelte v3.23.0 */

    function create_if_block(ctx) {
    	let h4;
    	let t0;
    	let t1;
    	let h4_transition;
    	let current;

    	return {
    		c() {
    			h4 = element("h4");
    			t0 = text("amount: $");
    			t1 = text(/*amount*/ ctx[2]);
    		},
    		m(target, anchor) {
    			insert(target, h4, anchor);
    			append(h4, t0);
    			append(h4, t1);
    			current = true;
    		},
    		p(ctx, dirty) {
    			if (!current || dirty & /*amount*/ 4) set_data(t1, /*amount*/ ctx[2]);
    		},
    		i(local) {
    			if (current) return;

    			add_render_callback(() => {
    				if (!h4_transition) h4_transition = create_bidirectional_transition(h4, slide, {}, true);
    				h4_transition.run(1);
    			});

    			current = true;
    		},
    		o(local) {
    			if (!h4_transition) h4_transition = create_bidirectional_transition(h4, slide, {}, false);
    			h4_transition.run(0);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(h4);
    			if (detaching && h4_transition) h4_transition.end();
    		}
    	};
    }

    function create_fragment$2(ctx) {
    	let article;
    	let div0;
    	let h2;
    	let t0;
    	let t1;
    	let button0;
    	let t2;
    	let t3;
    	let div1;
    	let button1;
    	let i1;
    	let t4;
    	let button2;
    	let current;
    	let mounted;
    	let dispose;
    	let if_block = /*displayAmount*/ ctx[3] && create_if_block(ctx);

    	return {
    		c() {
    			article = element("article");
    			div0 = element("div");
    			h2 = element("h2");
    			t0 = text(/*name*/ ctx[1]);
    			t1 = space();
    			button0 = element("button");
    			button0.innerHTML = `<i class="fas fa-caret-down"></i>`;
    			t2 = space();
    			if (if_block) if_block.c();
    			t3 = space();
    			div1 = element("div");
    			button1 = element("button");
    			i1 = element("i");
    			t4 = space();
    			button2 = element("button");
    			button2.innerHTML = `<i class="fas fa-trash"></i>`;
    			attr(button0, "class", "amount-btn");
    			attr(div0, "class", "expense-info");
    			attr(i1, "class", "fas fa-pen");
    			attr(button1, "class", "expense-btn edit-btn");
    			attr(button2, "class", "expense-btn delete-btn");
    			attr(div1, "class", "expense-buttons");
    			attr(article, "class", "single-expense");
    		},
    		m(target, anchor) {
    			insert(target, article, anchor);
    			append(article, div0);
    			append(div0, h2);
    			append(h2, t0);
    			append(h2, t1);
    			append(h2, button0);
    			append(div0, t2);
    			if (if_block) if_block.m(div0, null);
    			append(article, t3);
    			append(article, div1);
    			append(div1, button1);
    			append(button1, i1);
    			append(div1, t4);
    			append(div1, button2);
    			current = true;

    			if (!mounted) {
    				dispose = [
    					listen(button0, "click", /*toogleAmount*/ ctx[4]),
    					listen(i1, "click", /*click_handler*/ ctx[7]),
    					listen(button2, "click", /*click_handler_1*/ ctx[8])
    				];

    				mounted = true;
    			}
    		},
    		p(ctx, [dirty]) {
    			if (!current || dirty & /*name*/ 2) set_data(t0, /*name*/ ctx[1]);

    			if (/*displayAmount*/ ctx[3]) {
    				if (if_block) {
    					if_block.p(ctx, dirty);

    					if (dirty & /*displayAmount*/ 8) {
    						transition_in(if_block, 1);
    					}
    				} else {
    					if_block = create_if_block(ctx);
    					if_block.c();
    					transition_in(if_block, 1);
    					if_block.m(div0, null);
    				}
    			} else if (if_block) {
    				group_outros();

    				transition_out(if_block, 1, 1, () => {
    					if_block = null;
    				});

    				check_outros();
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(if_block);
    			current = true;
    		},
    		o(local) {
    			transition_out(if_block);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(article);
    			if (if_block) if_block.d();
    			mounted = false;
    			run_all(dispose);
    		}
    	};
    }

    function instance$2($$self, $$props, $$invalidate) {
    	let { id } = $$props;
    	let { name = "" } = $$props;
    	let { amount = 0 } = $$props;
    	let displayAmount = false;

    	const toogleAmount = () => {
    		$$invalidate(3, displayAmount = !displayAmount);
    	};

    	const removeExpense = getContext("remove");
    	const setModifiedExpense = getContext("modify");
    	const click_handler = () => setModifiedExpense(id);
    	const click_handler_1 = () => removeExpense(id);

    	$$self.$set = $$props => {
    		if ("id" in $$props) $$invalidate(0, id = $$props.id);
    		if ("name" in $$props) $$invalidate(1, name = $$props.name);
    		if ("amount" in $$props) $$invalidate(2, amount = $$props.amount);
    	};

    	return [
    		id,
    		name,
    		amount,
    		displayAmount,
    		toogleAmount,
    		removeExpense,
    		setModifiedExpense,
    		click_handler,
    		click_handler_1
    	];
    }

    class Expense extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$2, create_fragment$2, safe_not_equal, { id: 0, name: 1, amount: 2 });
    	}
    }

    function flip(node, animation, params) {
        const style = getComputedStyle(node);
        const transform = style.transform === 'none' ? '' : style.transform;
        const scaleX = animation.from.width / node.clientWidth;
        const scaleY = animation.from.height / node.clientHeight;
        const dx = (animation.from.left - animation.to.left) / scaleX;
        const dy = (animation.from.top - animation.to.top) / scaleY;
        const d = Math.sqrt(dx * dx + dy * dy);
        const { delay = 0, duration = (d) => Math.sqrt(d) * 120, easing = cubicOut } = params;
        return {
            delay,
            duration: is_function(duration) ? duration(d) : duration,
            easing,
            css: (_t, u) => `transform: ${transform} translate(${u * dx}px, ${u * dy}px);`
        };
    }

    /* src/ExpensesList.svelte generated by Svelte v3.23.0 */

    function get_each_context(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[1] = list[i];
    	child_ctx[3] = i;
    	return child_ctx;
    }

    // (25:0) {:else}
    function create_else_block(ctx) {
    	let h2;

    	return {
    		c() {
    			h2 = element("h2");
    			h2.textContent = "no expenses added to the list";
    			attr(h2, "class", "svelte-1mw7nw");
    		},
    		m(target, anchor) {
    			insert(target, h2, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(h2);
    		}
    	};
    }

    // (20:0) {#each expenses as expense, index (expense.id)}
    function create_each_block(key_1, ctx) {
    	let div;
    	let t;
    	let div_intro;
    	let div_outro;
    	let rect;
    	let stop_animation = noop;
    	let current;
    	const expense_spread_levels = [/*expense*/ ctx[1]];
    	let expense_props = {};

    	for (let i = 0; i < expense_spread_levels.length; i += 1) {
    		expense_props = assign(expense_props, expense_spread_levels[i]);
    	}

    	const expense = new Expense({ props: expense_props });

    	return {
    		key: key_1,
    		first: null,
    		c() {
    			div = element("div");
    			create_component(expense.$$.fragment);
    			t = space();
    			this.first = div;
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			mount_component(expense, div, null);
    			append(div, t);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const expense_changes = (dirty & /*expenses*/ 1)
    			? get_spread_update(expense_spread_levels, [get_spread_object(/*expense*/ ctx[1])])
    			: {};

    			expense.$set(expense_changes);
    		},
    		r() {
    			rect = div.getBoundingClientRect();
    		},
    		f() {
    			fix_position(div);
    			stop_animation();
    			add_transform(div, rect);
    		},
    		a() {
    			stop_animation();
    			stop_animation = create_animation(div, rect, flip, {});
    		},
    		i(local) {
    			if (current) return;
    			transition_in(expense.$$.fragment, local);

    			add_render_callback(() => {
    				if (div_outro) div_outro.end(1);

    				if (!div_intro) div_intro = create_in_transition(div, fly, {
    					x: 200,
    					delay: (/*index*/ ctx[3] + 1) * 700
    				});

    				div_intro.start();
    			});

    			current = true;
    		},
    		o(local) {
    			transition_out(expense.$$.fragment, local);
    			if (div_intro) div_intro.invalidate();
    			div_outro = create_out_transition(div, fly, { x: -200 });
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    			destroy_component(expense);
    			if (detaching && div_outro) div_outro.end();
    		}
    	};
    }

    function create_fragment$3(ctx) {
    	let section;
    	let t;
    	let ul;
    	let each_blocks = [];
    	let each_1_lookup = new Map();
    	let current;
    	const sectiontitle = new Title({ props: { title: "expense List" } });
    	let each_value = /*expenses*/ ctx[0];
    	const get_key = ctx => /*expense*/ ctx[1].id;

    	for (let i = 0; i < each_value.length; i += 1) {
    		let child_ctx = get_each_context(ctx, each_value, i);
    		let key = get_key(child_ctx);
    		each_1_lookup.set(key, each_blocks[i] = create_each_block(key, child_ctx));
    	}

    	let each_1_else = null;

    	if (!each_value.length) {
    		each_1_else = create_else_block();
    	}

    	return {
    		c() {
    			section = element("section");
    			create_component(sectiontitle.$$.fragment);
    			t = space();
    			ul = element("ul");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			if (each_1_else) {
    				each_1_else.c();
    			}
    		},
    		m(target, anchor) {
    			insert(target, section, anchor);
    			mount_component(sectiontitle, section, null);
    			append(section, t);
    			append(section, ul);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(ul, null);
    			}

    			if (each_1_else) {
    				each_1_else.m(ul, null);
    			}

    			current = true;
    		},
    		p(ctx, [dirty]) {
    			if (dirty & /*expenses*/ 1) {
    				const each_value = /*expenses*/ ctx[0];
    				group_outros();
    				for (let i = 0; i < each_blocks.length; i += 1) each_blocks[i].r();
    				each_blocks = update_keyed_each(each_blocks, dirty, get_key, 1, ctx, each_value, each_1_lookup, ul, fix_and_outro_and_destroy_block, create_each_block, null, get_each_context);
    				for (let i = 0; i < each_blocks.length; i += 1) each_blocks[i].a();
    				check_outros();

    				if (each_value.length) {
    					if (each_1_else) {
    						each_1_else.d(1);
    						each_1_else = null;
    					}
    				} else if (!each_1_else) {
    					each_1_else = create_else_block();
    					each_1_else.c();
    					each_1_else.m(ul, null);
    				}
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(sectiontitle.$$.fragment, local);

    			for (let i = 0; i < each_value.length; i += 1) {
    				transition_in(each_blocks[i]);
    			}

    			current = true;
    		},
    		o(local) {
    			transition_out(sectiontitle.$$.fragment, local);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				transition_out(each_blocks[i]);
    			}

    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(section);
    			destroy_component(sectiontitle);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].d();
    			}

    			if (each_1_else) each_1_else.d();
    		}
    	};
    }

    function instance$3($$self, $$props, $$invalidate) {
    	let { expenses = [] } = $$props;

    	$$self.$set = $$props => {
    		if ("expenses" in $$props) $$invalidate(0, expenses = $$props.expenses);
    	};

    	return [expenses];
    }

    class ExpensesList extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$3, create_fragment$3, safe_not_equal, { expenses: 0 });
    	}
    }

    /* src/Totals.svelte generated by Svelte v3.23.0 */

    function create_fragment$4(ctx) {
    	let section;
    	let h2;
    	let t0;
    	let t1;
    	let t2;

    	return {
    		c() {
    			section = element("section");
    			h2 = element("h2");
    			t0 = text(/*title*/ ctx[0]);
    			t1 = text(" : $");
    			t2 = text(/*total*/ ctx[1]);
    			attr(section, "class", "main-title");
    		},
    		m(target, anchor) {
    			insert(target, section, anchor);
    			append(section, h2);
    			append(h2, t0);
    			append(h2, t1);
    			append(h2, t2);
    		},
    		p(ctx, [dirty]) {
    			if (dirty & /*title*/ 1) set_data(t0, /*title*/ ctx[0]);
    			if (dirty & /*total*/ 2) set_data(t2, /*total*/ ctx[1]);
    		},
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(section);
    		}
    	};
    }

    function instance$4($$self, $$props, $$invalidate) {
    	let { title = "default title" } = $$props;
    	let { total = 0 } = $$props;

    	$$self.$set = $$props => {
    		if ("title" in $$props) $$invalidate(0, title = $$props.title);
    		if ("total" in $$props) $$invalidate(1, total = $$props.total);
    	};

    	return [title, total];
    }

    class Totals extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$4, create_fragment$4, safe_not_equal, { title: 0, total: 1 });
    	}
    }

    /* src/ExpenseForm.svelte generated by Svelte v3.23.0 */

    function create_if_block_1(ctx) {
    	let p;

    	return {
    		c() {
    			p = element("p");
    			p.textContent = "Please fill out all form fields";
    			attr(p, "class", "form-empty");
    		},
    		m(target, anchor) {
    			insert(target, p, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(p);
    		}
    	};
    }

    // (49:29) {:else}
    function create_else_block$1(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("add expense");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (49:2) {#if isEditing}
    function create_if_block$1(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("edit expense");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    function create_fragment$5(ctx) {
    	let section;
    	let t0;
    	let form;
    	let div0;
    	let label0;
    	let t2;
    	let input0;
    	let t3;
    	let div1;
    	let label1;
    	let t5;
    	let input1;
    	let t6;
    	let t7;
    	let button0;
    	let t8;
    	let button1;
    	let i;
    	let t9;
    	let current;
    	let mounted;
    	let dispose;
    	const title = new Title({ props: { title: "add expense" } });
    	let if_block0 = /*isEmpty*/ ctx[4] && create_if_block_1();

    	function select_block_type(ctx, dirty) {
    		if (/*isEditing*/ ctx[2]) return create_if_block$1;
    		return create_else_block$1;
    	}

    	let current_block_type = select_block_type(ctx);
    	let if_block1 = current_block_type(ctx);

    	return {
    		c() {
    			section = element("section");
    			create_component(title.$$.fragment);
    			t0 = space();
    			form = element("form");
    			div0 = element("div");
    			label0 = element("label");
    			label0.textContent = "name";
    			t2 = space();
    			input0 = element("input");
    			t3 = space();
    			div1 = element("div");
    			label1 = element("label");
    			label1.textContent = "amount";
    			t5 = space();
    			input1 = element("input");
    			t6 = space();
    			if (if_block0) if_block0.c();
    			t7 = space();
    			button0 = element("button");
    			if_block1.c();
    			t8 = space();
    			button1 = element("button");
    			i = element("i");
    			t9 = text(" close");
    			attr(label0, "for", "name");
    			attr(input0, "type", "text");
    			attr(input0, "id", "name");
    			attr(div0, "class", "form-control");
    			attr(label1, "for", "amount");
    			attr(input1, "type", "number");
    			attr(input1, "id", "amount");
    			attr(div1, "class", "form-control");
    			attr(button0, "type", "submit");
    			attr(button0, "class", "btn btn-block");
    			button0.disabled = /*isEmpty*/ ctx[4];
    			toggle_class(button0, "disabled", /*isEmpty*/ ctx[4]);
    			attr(i, "class", "fas fa-times");
    			attr(button1, "class", "close-btn");
    			attr(button1, "type", "button");
    			attr(form, "class", "expense-form");
    			attr(section, "class", "form");
    		},
    		m(target, anchor) {
    			insert(target, section, anchor);
    			mount_component(title, section, null);
    			append(section, t0);
    			append(section, form);
    			append(form, div0);
    			append(div0, label0);
    			append(div0, t2);
    			append(div0, input0);
    			set_input_value(input0, /*name*/ ctx[0]);
    			append(form, t3);
    			append(form, div1);
    			append(div1, label1);
    			append(div1, t5);
    			append(div1, input1);
    			set_input_value(input1, /*amount*/ ctx[1]);
    			append(form, t6);
    			if (if_block0) if_block0.m(form, null);
    			append(form, t7);
    			append(form, button0);
    			if_block1.m(button0, null);
    			append(form, t8);
    			append(form, button1);
    			append(button1, i);
    			append(button1, t9);
    			current = true;

    			if (!mounted) {
    				dispose = [
    					listen(input0, "input", /*input0_input_handler*/ ctx[8]),
    					listen(input1, "input", /*input1_input_handler*/ ctx[9]),
    					listen(i, "click", function () {
    						if (is_function(/*hideForm*/ ctx[3])) /*hideForm*/ ctx[3].apply(this, arguments);
    					}),
    					listen(form, "submit", prevent_default(/*handleSubmit*/ ctx[5]))
    				];

    				mounted = true;
    			}
    		},
    		p(new_ctx, [dirty]) {
    			ctx = new_ctx;

    			if (dirty & /*name*/ 1 && input0.value !== /*name*/ ctx[0]) {
    				set_input_value(input0, /*name*/ ctx[0]);
    			}

    			if (dirty & /*amount*/ 2 && to_number(input1.value) !== /*amount*/ ctx[1]) {
    				set_input_value(input1, /*amount*/ ctx[1]);
    			}

    			if (/*isEmpty*/ ctx[4]) {
    				if (if_block0) ; else {
    					if_block0 = create_if_block_1();
    					if_block0.c();
    					if_block0.m(form, t7);
    				}
    			} else if (if_block0) {
    				if_block0.d(1);
    				if_block0 = null;
    			}

    			if (current_block_type !== (current_block_type = select_block_type(ctx))) {
    				if_block1.d(1);
    				if_block1 = current_block_type(ctx);

    				if (if_block1) {
    					if_block1.c();
    					if_block1.m(button0, null);
    				}
    			}

    			if (!current || dirty & /*isEmpty*/ 16) {
    				button0.disabled = /*isEmpty*/ ctx[4];
    			}

    			if (dirty & /*isEmpty*/ 16) {
    				toggle_class(button0, "disabled", /*isEmpty*/ ctx[4]);
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(title.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(title.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(section);
    			destroy_component(title);
    			if (if_block0) if_block0.d();
    			if_block1.d();
    			mounted = false;
    			run_all(dispose);
    		}
    	};
    }

    function instance$5($$self, $$props, $$invalidate) {
    	let { name = "" } = $$props; //ese export es para poder usarlas desde la función editar también
    	let { amount = null } = $$props;
    	let { addExpense } = $$props;
    	let { isEditing } = $$props;
    	let { editExpense } = $$props;
    	let { hideForm } = $$props;

    	const handleSubmit = () => {
    		if (isEditing) {
    			editExpense({ name, amount });
    		} else {
    			addExpense({ name, amount });
    		}

    		$$invalidate(0, name = "");
    		$$invalidate(1, amount = null);
    		hideForm();
    	};

    	function input0_input_handler() {
    		name = this.value;
    		$$invalidate(0, name);
    	}

    	function input1_input_handler() {
    		amount = to_number(this.value);
    		$$invalidate(1, amount);
    	}

    	$$self.$set = $$props => {
    		if ("name" in $$props) $$invalidate(0, name = $$props.name);
    		if ("amount" in $$props) $$invalidate(1, amount = $$props.amount);
    		if ("addExpense" in $$props) $$invalidate(6, addExpense = $$props.addExpense);
    		if ("isEditing" in $$props) $$invalidate(2, isEditing = $$props.isEditing);
    		if ("editExpense" in $$props) $$invalidate(7, editExpense = $$props.editExpense);
    		if ("hideForm" in $$props) $$invalidate(3, hideForm = $$props.hideForm);
    	};

    	let isEmpty;

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*name, amount*/ 3) {
    			 $$invalidate(4, isEmpty = !name || !amount);
    		}
    	};

    	return [
    		name,
    		amount,
    		isEditing,
    		hideForm,
    		isEmpty,
    		handleSubmit,
    		addExpense,
    		editExpense,
    		input0_input_handler,
    		input1_input_handler
    	];
    }

    class ExpenseForm extends SvelteComponent {
    	constructor(options) {
    		super();

    		init(this, options, instance$5, create_fragment$5, safe_not_equal, {
    			name: 0,
    			amount: 1,
    			addExpense: 6,
    			isEditing: 2,
    			editExpense: 7,
    			hideForm: 3
    		});
    	}
    }

    /* src/Modal.svelte generated by Svelte v3.23.0 */

    function create_fragment$6(ctx) {
    	let div1;
    	let div0;
    	let div0_transition;
    	let div1_intro;
    	let div1_outro;
    	let current;
    	const default_slot_template = /*$$slots*/ ctx[1].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[0], null);

    	return {
    		c() {
    			div1 = element("div");
    			div0 = element("div");
    			if (default_slot) default_slot.c();
    			attr(div0, "class", "modal-content");
    			attr(div1, "class", "modal-container");
    		},
    		m(target, anchor) {
    			insert(target, div1, anchor);
    			append(div1, div0);

    			if (default_slot) {
    				default_slot.m(div0, null);
    			}

    			current = true;
    		},
    		p(ctx, [dirty]) {
    			if (default_slot) {
    				if (default_slot.p && dirty & /*$$scope*/ 1) {
    					update_slot(default_slot, default_slot_template, ctx, /*$$scope*/ ctx[0], dirty, null, null);
    				}
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(default_slot, local);

    			add_render_callback(() => {
    				if (!div0_transition) div0_transition = create_bidirectional_transition(div0, fly, { y: 200 }, true);
    				div0_transition.run(1);
    			});

    			add_render_callback(() => {
    				if (div1_outro) div1_outro.end(1);
    				if (!div1_intro) div1_intro = create_in_transition(div1, blur, {});
    				div1_intro.start();
    			});

    			current = true;
    		},
    		o(local) {
    			transition_out(default_slot, local);
    			if (!div0_transition) div0_transition = create_bidirectional_transition(div0, fly, { y: 200 }, false);
    			div0_transition.run(0);
    			if (div1_intro) div1_intro.invalidate();
    			div1_outro = create_out_transition(div1, fade, {});
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div1);
    			if (default_slot) default_slot.d(detaching);
    			if (detaching && div0_transition) div0_transition.end();
    			if (detaching && div1_outro) div1_outro.end();
    		}
    	};
    }

    function instance$6($$self, $$props, $$invalidate) {
    	let { $$slots = {}, $$scope } = $$props;

    	$$self.$set = $$props => {
    		if ("$$scope" in $$props) $$invalidate(0, $$scope = $$props.$$scope);
    	};

    	return [$$scope, $$slots];
    }

    class Modal extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$6, create_fragment$6, safe_not_equal, {});
    	}
    }

    /* src/App.svelte generated by Svelte v3.23.0 */

    function create_if_block$2(ctx) {
    	let current;

    	const modal = new Modal({
    			props: {
    				$$slots: { default: [create_default_slot] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			create_component(modal.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(modal, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const modal_changes = {};

    			if (dirty & /*$$scope, setName, setAmount, isEditing*/ 32790) {
    				modal_changes.$$scope = { dirty, ctx };
    			}

    			modal.$set(modal_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(modal.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(modal.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(modal, detaching);
    		}
    	};
    }

    // (91:0) <Modal>
    function create_default_slot(ctx) {
    	let current;

    	const expenseform = new ExpenseForm({
    			props: {
    				addExpense: /*addExpense*/ ctx[9],
    				name: /*setName*/ ctx[1],
    				amount: /*setAmount*/ ctx[2],
    				isEditing: /*isEditing*/ ctx[4],
    				editExpense: /*editExpense*/ ctx[10],
    				hideForm: /*hideForm*/ ctx[7]
    			}
    		});

    	return {
    		c() {
    			create_component(expenseform.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(expenseform, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const expenseform_changes = {};
    			if (dirty & /*setName*/ 2) expenseform_changes.name = /*setName*/ ctx[1];
    			if (dirty & /*setAmount*/ 4) expenseform_changes.amount = /*setAmount*/ ctx[2];
    			if (dirty & /*isEditing*/ 16) expenseform_changes.isEditing = /*isEditing*/ ctx[4];
    			expenseform.$set(expenseform_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(expenseform.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(expenseform.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(expenseform, detaching);
    		}
    	};
    }

    function create_fragment$7(ctx) {
    	let t0;
    	let main;
    	let t1;
    	let t2;
    	let t3;
    	let button;
    	let current;
    	let mounted;
    	let dispose;
    	const navbar = new Navbar({ props: { showForm: /*showForm*/ ctx[6] } });
    	let if_block = /*isFormOpen*/ ctx[3] && create_if_block$2(ctx);

    	const totals = new Totals({
    			props: {
    				title: "Total expenses",
    				total: /*total*/ ctx[5]
    			}
    		});

    	const expenseslist = new ExpensesList({ props: { expenses: /*expenses*/ ctx[0] } });

    	return {
    		c() {
    			create_component(navbar.$$.fragment);
    			t0 = space();
    			main = element("main");
    			if (if_block) if_block.c();
    			t1 = space();
    			create_component(totals.$$.fragment);
    			t2 = space();
    			create_component(expenseslist.$$.fragment);
    			t3 = space();
    			button = element("button");
    			button.textContent = "Clear expenses";
    			attr(button, "type", "button");
    			attr(button, "class", "btn btn-primary btn-block");
    			attr(main, "class", "content");
    		},
    		m(target, anchor) {
    			mount_component(navbar, target, anchor);
    			insert(target, t0, anchor);
    			insert(target, main, anchor);
    			if (if_block) if_block.m(main, null);
    			append(main, t1);
    			mount_component(totals, main, null);
    			append(main, t2);
    			mount_component(expenseslist, main, null);
    			append(main, t3);
    			append(main, button);
    			current = true;

    			if (!mounted) {
    				dispose = listen(button, "click", /*clearExpenses*/ ctx[8]);
    				mounted = true;
    			}
    		},
    		p(ctx, [dirty]) {
    			if (/*isFormOpen*/ ctx[3]) {
    				if (if_block) {
    					if_block.p(ctx, dirty);

    					if (dirty & /*isFormOpen*/ 8) {
    						transition_in(if_block, 1);
    					}
    				} else {
    					if_block = create_if_block$2(ctx);
    					if_block.c();
    					transition_in(if_block, 1);
    					if_block.m(main, t1);
    				}
    			} else if (if_block) {
    				group_outros();

    				transition_out(if_block, 1, 1, () => {
    					if_block = null;
    				});

    				check_outros();
    			}

    			const totals_changes = {};
    			if (dirty & /*total*/ 32) totals_changes.total = /*total*/ ctx[5];
    			totals.$set(totals_changes);
    			const expenseslist_changes = {};
    			if (dirty & /*expenses*/ 1) expenseslist_changes.expenses = /*expenses*/ ctx[0];
    			expenseslist.$set(expenseslist_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(navbar.$$.fragment, local);
    			transition_in(if_block);
    			transition_in(totals.$$.fragment, local);
    			transition_in(expenseslist.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(navbar.$$.fragment, local);
    			transition_out(if_block);
    			transition_out(totals.$$.fragment, local);
    			transition_out(expenseslist.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(navbar, detaching);
    			if (detaching) detach(t0);
    			if (detaching) detach(main);
    			if (if_block) if_block.d();
    			destroy_component(totals);
    			destroy_component(expenseslist);
    			mounted = false;
    			dispose();
    		}
    	};
    }

    function instance$7($$self, $$props, $$invalidate) {
    	let expenses = [];

    	//set editing variables
    	let setName = "";

    	let setAmount = null;
    	let setId = null;

    	//Toggle form variables
    	let isFormOpen = false;

    	//Functions
    	const showForm = () => {
    		$$invalidate(3, isFormOpen = true);
    	};

    	const hideForm = () => {
    		$$invalidate(3, isFormOpen = false);
    		$$invalidate(1, setName = "");
    		$$invalidate(2, setAmount = null);
    		$$invalidate(11, setId = null);
    	};

    	const removeExpense = id => {
    		$$invalidate(0, expenses = expenses.filter(item => item.id !== id));
    	};

    	const clearExpenses = () => {
    		$$invalidate(0, expenses = []);
    	};

    	const addExpense = ({ name, amount }) => {
    		let expense = {
    			id: Math.random() * Date.now(),
    			name,
    			amount
    		};

    		$$invalidate(0, expenses = [expense, ...expenses]);
    	};

    	const setModifiedExpense = id => {
    		let expense = expenses.find(item => item.id === id);
    		$$invalidate(11, setId = expense.id);
    		$$invalidate(1, setName = expense.name);
    		$$invalidate(2, setAmount = expense.amount);
    		showForm();
    	};

    	const editExpense = ({ name, amount }) => {
    		$$invalidate(0, expenses = expenses.map(item => {
    			return item.id === setId
    			? { ...item, name, amount }
    			: { ...item };
    		}));

    		$$invalidate(11, setId = null);
    		$$invalidate(2, setAmount = null);
    		$$invalidate(1, setName = "");
    	};

    	//Context  
    	setContext("remove", removeExpense);

    	setContext("modify", setModifiedExpense);

    	//Local storage
    	const setLocalStorage = () => {
    		localStorage.setItem("expenses", JSON.stringify(expenses));
    	};

    	onMount(() => {
    		$$invalidate(0, expenses = localStorage.getItem("expenses")
    		? JSON.parse(localStorage.getItem("expenses"))
    		: []);
    	});

    	afterUpdate(() => {
    		setLocalStorage();
    	});

    	let isEditing;
    	let total;

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*setId*/ 2048) {
    			//reactive
    			 $$invalidate(4, isEditing = setId ? true : false);
    		}

    		if ($$self.$$.dirty & /*expenses*/ 1) {
    			 $$invalidate(5, total = expenses.reduce(
    				(ac, curr) => {
    					return ac += curr.amount;
    				},
    				0
    			));
    		}
    	};

    	return [
    		expenses,
    		setName,
    		setAmount,
    		isFormOpen,
    		isEditing,
    		total,
    		showForm,
    		hideForm,
    		clearExpenses,
    		addExpense,
    		editExpense
    	];
    }

    class App extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$7, create_fragment$7, safe_not_equal, {});
    	}
    }

    const app = new App({
    	target: document.body,

    });

    return app;

}());
//# sourceMappingURL=bundle.js.map
