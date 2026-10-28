/* =============================================================
   PERIBACA — вся интерактивность страницы.
   Зависимостей нет: только нативные API браузера.
   ============================================================= */

document.addEventListener('DOMContentLoaded', () => {
    'use strict';

    /* Форма ничего не отправляет: это демо-проект в публичном репозитории,
       а ключ любого почтового сервиса в открытом коде может использовать кто угодно.
       Боевой режим включается сменой флага и раскомментированием fetch в sendForm(). */
    const DEMO_MODE = true;

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    /* Браузер восстанавливает прокрутку при перезагрузке до того, как подгрузились
       веб-шрифты и ленивые картинки. Высота блоков после этого меняется, и страница
       открывается посреди чужой секции. Для лендинга предсказуемее всегда начинать сверху. */
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

    /* ---------------------------------------------------------
       Единая блокировка прокрутки.
       Меню, модалка и лайтбокс могут открываться друг над другом,
       поэтому счётчик держим общий — иначе один закрывшийся слой
       разблокирует страницу под другим, ещё открытым.
       --------------------------------------------------------- */
    const scrollLock = {
        holders: new Set(),
        lock(key) {
            if (!this.holders.size) {
                const gap = window.innerWidth - document.documentElement.clientWidth;
                if (gap > 0) document.body.style.paddingRight = gap + 'px';
                document.body.classList.add('is-locked');
            }
            this.holders.add(key);
        },
        unlock(key) {
            this.holders.delete(key);
            if (!this.holders.size) {
                document.body.classList.remove('is-locked');
                document.body.style.paddingRight = '';
            }
        }
    };

    const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

    /* Удержание фокуса внутри открытого слоя */
    function trapFocus(container, event) {
        const items = [...container.querySelectorAll(FOCUSABLE)].filter(el => el.offsetParent !== null);
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];

        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    }

    /* =========================================================
       ШАПКА: фон при скролле и подсветка активного пункта
       ========================================================= */
    const header = document.getElementById('header');
    const navLinks = [...document.querySelectorAll('.nav__link')];

    let ticking = false;
    function onScroll() {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(() => {
            header.classList.toggle('header--scrolled', window.scrollY > 40);
            ticking = false;
        });
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    const sections = navLinks
        .map(link => document.querySelector(link.getAttribute('href')))
        .filter(Boolean);

    if (sections.length && 'IntersectionObserver' in window) {
        const spy = new IntersectionObserver(entries => {
            entries.forEach(entry => {
                if (!entry.isIntersecting) return;
                const id = '#' + entry.target.id;
                navLinks.forEach(link => link.classList.toggle('is-active', link.getAttribute('href') === id));
            });
        }, { rootMargin: '-45% 0px -50% 0px' });

        sections.forEach(section => spy.observe(section));
    }

    /* =========================================================
       БУРГЕР-МЕНЮ
       ========================================================= */
    const burger = document.getElementById('burger');
    const nav = document.getElementById('nav');

    function setMenu(open) {
        burger.classList.toggle('is-open', open);
        burger.setAttribute('aria-expanded', String(open));
        burger.setAttribute('aria-label', open ? 'Закрыть меню' : 'Открыть меню');
        nav.classList.toggle('is-open', open);
        header.classList.toggle('header--menu-open', open);
        open ? scrollLock.lock('menu') : scrollLock.unlock('menu');
        // Закрытое меню не должно ловить фокус табом
        nav.querySelectorAll(FOCUSABLE).forEach(el => {
            if (isMobileMenu()) el.tabIndex = open ? 0 : -1;
            else el.removeAttribute('tabindex');
        });
    }

    function isMobileMenu() {
        return window.matchMedia('(max-width: 900px)').matches;
    }

    function isMenuOpen() {
        return nav.classList.contains('is-open');
    }

    burger.addEventListener('click', () => setMenu(!isMenuOpen()));

    nav.addEventListener('click', event => {
        if (event.target.closest('a, button') && isMenuOpen()) setMenu(false);
    });

    // Клик по затемнению рядом с панелью тоже закрывает меню
    document.addEventListener('click', event => {
        if (!isMenuOpen()) return;
        if (nav.contains(event.target) || burger.contains(event.target)) return;
        setMenu(false);
    });

    // Возврат на десктоп при открытом меню не должен оставлять страницу заблокированной
    window.matchMedia('(max-width: 900px)').addEventListener('change', event => {
        if (!event.matches && isMenuOpen()) setMenu(false);
        if (!event.matches) nav.querySelectorAll(FOCUSABLE).forEach(el => el.removeAttribute('tabindex'));
    });

    if (isMobileMenu()) setMenu(false);

    /* =========================================================
       ПЛАВНАЯ ПРОКРУТКА ПО КНОПКАМ
       (у ссылок это делает CSS scroll-behavior)
       ========================================================= */
    document.querySelectorAll('[data-scroll-to]').forEach(btn => {
        btn.addEventListener('click', () => {
            const target = document.querySelector(btn.dataset.scrollTo);
            if (target) target.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth', block: 'start' });
        });
    });

    /* =========================================================
       РАССВЕТ В ГЁРЕМЕ
       Время восхода на завтра по упрощённой формуле NOAA (точность —
       пара минут) и время, когда гостя забирают из отеля к полёту.
       В Турции круглый год UTC+3, поэтому часовой пояс посетителя не важен.
       ========================================================= */
    const sunriseTime = document.querySelector('[data-sunrise]');
    const sunriseNote = document.querySelector('[data-sunrise-note]');

    const GOREME = { lat: 38.643, lon: 34.829 };
    const TURKEY_OFFSET = 3 * 3600e3;
    const PICKUP_BEFORE = 90 * 60e3;

    function sunriseUTC(year, month, day, lat, lon) {
        const rad = Math.PI / 180;
        const jd = Date.UTC(year, month, day) / 864e5 + 2440587.5;
        const n = Math.ceil(jd - 2451545 + 0.0008);
        const meanNoon = n - lon / 360;
        const anomaly = (357.5291 + 0.98560028 * meanNoon) % 360;
        const center = 1.9148 * Math.sin(anomaly * rad) + 0.02 * Math.sin(2 * anomaly * rad)
            + 0.0003 * Math.sin(3 * anomaly * rad);
        const longitude = (anomaly + center + 180 + 102.9372) % 360;
        const transit = 2451545 + meanNoon + 0.0053 * Math.sin(anomaly * rad)
            - 0.0069 * Math.sin(2 * longitude * rad);
        const sinDecl = Math.sin(longitude * rad) * Math.sin(23.4397 * rad);
        const cosHour = (Math.sin(-0.833 * rad) - Math.sin(lat * rad) * sinDecl)
            / (Math.cos(lat * rad) * Math.cos(Math.asin(sinDecl)));
        const hourAngle = Math.acos(cosHour) / rad;
        return (transit - hourAngle / 360 - 2440587.5) * 864e5;
    }

    // Время в Турции: сдвигаем метку на UTC+3 и читаем её UTC-полями
    const turkeyClock = ms => {
        const d = new Date(ms + TURKEY_OFFSET);
        return d.getUTCHours() + ':' + String(d.getUTCMinutes()).padStart(2, '0');
    };

    if (sunriseTime && sunriseNote) {
        const tomorrow = new Date(Date.now() + TURKEY_OFFSET + 864e5);
        const rise = sunriseUTC(tomorrow.getUTCFullYear(), tomorrow.getUTCMonth(), tomorrow.getUTCDate(),
            GOREME.lat, GOREME.lon);
        // Забираем за полтора часа, округляя вниз до пяти минут
        const pickup = Math.floor((rise - PICKUP_BEFORE) / 3e5) * 3e5;
        const month = tomorrow.getUTCMonth();
        const inSeason = month >= 3 && month <= 10;

        sunriseTime.innerHTML = 'Рассвет в Гёреме завтра в <time>' + turkeyClock(rise) + '</time>';
        sunriseTime.hidden = false;
        sunriseNote.textContent = inSeason
            ? 'К полёту заберём вас из отеля в ' + turkeyClock(pickup) + '.'
            : 'Сезон полётов — с апреля по ноябрь, зимой шары поднимаются реже.';
    }

    /* =========================================================
       FAQ-АККОРДЕОН
       ========================================================= */
    document.querySelectorAll('.faq__question').forEach(question => {
        question.addEventListener('click', () => {
            const answer = document.getElementById(question.getAttribute('aria-controls'));
            const isOpen = question.getAttribute('aria-expanded') === 'true';

            // Одновременно открыт только один ответ
            document.querySelectorAll('.faq__question[aria-expanded="true"]').forEach(other => {
                if (other === question) return;
                other.setAttribute('aria-expanded', 'false');
                document.getElementById(other.getAttribute('aria-controls')).hidden = true;
            });

            question.setAttribute('aria-expanded', String(!isOpen));
            answer.hidden = isOpen;
        });
    });

    /* =========================================================
       КАРУСЕЛЬ ОТЗЫВОВ
       Прокрутка, свайп и клавиатура — нативные, JS нужен только
       кнопкам и блокировке их на краях ленты.
       ========================================================= */
    const track = document.getElementById('reviewsTrack');
    const prevBtn = document.getElementById('reviewsPrev');
    const nextBtn = document.getElementById('reviewsNext');

    if (track && prevBtn && nextBtn) {
        const step = () => {
            const card = track.querySelector('.review');
            if (!card) return track.clientWidth;
            const gap = parseFloat(getComputedStyle(track).columnGap) || 24;
            return card.getBoundingClientRect().width + gap;
        };

        const scrollBy = direction => track.scrollBy({
            left: direction * step(),
            behavior: prefersReducedMotion ? 'auto' : 'smooth'
        });

        prevBtn.addEventListener('click', () => scrollBy(-1));
        nextBtn.addEventListener('click', () => scrollBy(1));

        let trackTicking = false;
        function syncArrows() {
            const max = track.scrollWidth - track.clientWidth;
            prevBtn.disabled = track.scrollLeft <= 2;
            nextBtn.disabled = track.scrollLeft >= max - 2;
        }
        track.addEventListener('scroll', () => {
            if (trackTicking) return;
            trackTicking = true;
            requestAnimationFrame(() => {
                syncArrows();
                trackTicking = false;
            });
        }, { passive: true });
        window.addEventListener('resize', syncArrows);
        syncArrows();
    }

    /* =========================================================
       МОДАЛЬНОЕ ОКНО ЗАЯВКИ
       ========================================================= */
    const modal = document.getElementById('modal');
    const modalService = document.getElementById('modalService');
    const modalServiceLabel = modal.querySelector('[data-modal-service]');
    let lastFocused = null;

    function openModal(service) {
        lastFocused = document.activeElement;
        if (service) {
            modalService.value = service;
            modalServiceLabel.textContent = service;
        }
        modal.hidden = false;
        scrollLock.lock('modal');
        const firstField = modal.querySelector('input:not([type="hidden"]):not([tabindex="-1"])');
        (firstField || modal.querySelector('.modal__close')).focus();
    }

    function closeModal() {
        if (modal.hidden) return;
        modal.hidden = true;
        scrollLock.unlock('modal');
        if (lastFocused) lastFocused.focus();
    }

    document.querySelectorAll('[data-modal-open]').forEach(btn => {
        btn.addEventListener('click', () => {
            if (isMenuOpen()) setMenu(false);
            openModal(btn.dataset.service);
        });
    });

    modal.querySelectorAll('[data-modal-close]').forEach(btn => btn.addEventListener('click', closeModal));

    /* =========================================================
       ЛАЙТБОКС ГАЛЕРЕИ
       ========================================================= */
    const lightbox = document.getElementById('lightbox');
    const lightboxImg = document.getElementById('lightboxImg');
    const lightboxCaption = document.getElementById('lightboxCaption');
    const galleryButtons = [...document.querySelectorAll('.gallery__btn')];
    let currentIndex = 0;
    let lightboxOpener = null;

    function showSlide(index) {
        currentIndex = (index + galleryButtons.length) % galleryButtons.length;
        const btn = galleryButtons[currentIndex];
        const img = btn.querySelector('img');
        lightboxImg.src = btn.dataset.full;
        lightboxImg.alt = img ? img.alt : '';
        lightboxCaption.textContent = btn.dataset.caption || '';
    }

    function openLightbox(index, opener) {
        lightboxOpener = opener;
        showSlide(index);
        lightbox.hidden = false;
        scrollLock.lock('lightbox');
        lightbox.querySelector('.lightbox__close').focus();
    }

    function closeLightbox() {
        if (lightbox.hidden) return;
        lightbox.hidden = true;
        lightboxImg.removeAttribute('src');
        scrollLock.unlock('lightbox');
        if (lightboxOpener) lightboxOpener.focus();
    }

    galleryButtons.forEach((btn, index) => {
        btn.addEventListener('click', () => openLightbox(index, btn));
    });

    lightbox.querySelector('[data-lightbox-close]').addEventListener('click', closeLightbox);
    lightbox.querySelector('[data-lightbox-prev]').addEventListener('click', () => showSlide(currentIndex - 1));
    lightbox.querySelector('[data-lightbox-next]').addEventListener('click', () => showSlide(currentIndex + 1));

    // Клик мимо картинки закрывает просмотр
    lightbox.addEventListener('click', event => {
        if (event.target === lightbox || event.target.classList.contains('lightbox__figure')) closeLightbox();
    });

    /* =========================================================
       ОБЩИЕ ГОРЯЧИЕ КЛАВИШИ
       Esc закрывает только то, что действительно открыто.
       ========================================================= */
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
            if (!lightbox.hidden) closeLightbox();
            else if (!modal.hidden) closeModal();
            else if (isMenuOpen()) setMenu(false);
            return;
        }

        if (!lightbox.hidden) {
            if (event.key === 'ArrowLeft') showSlide(currentIndex - 1);
            if (event.key === 'ArrowRight') showSlide(currentIndex + 1);
        }

        if (event.key === 'Tab') {
            if (!lightbox.hidden) trapFocus(lightbox, event);
            else if (!modal.hidden) trapFocus(modal, event);
            else if (isMenuOpen() && isMobileMenu()) trapFocus(header, event);
        }
    });

    /* =========================================================
       ФОРМЫ: ВАЛИДАЦИЯ И ОТПРАВКА
       ========================================================= */
    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-zA-Zа-яА-Я]{2,}$/;
    const PHONE_RE = /^\+?[\d\s\-()]{10,18}$/;

    function fieldError(input, message) {
        const holder = input.closest('.form__field');
        const box = holder ? holder.querySelector('[data-error]') : null;
        input.classList.toggle('is-invalid', Boolean(message));
        input.setAttribute('aria-invalid', String(Boolean(message)));
        if (box) {
            box.textContent = message || '';
            box.classList.toggle('is-visible', Boolean(message));
        }
    }

    function validate(form) {
        let firstInvalid = null;

        const name = form.elements.name;
        if (name) {
            const value = name.value.trim();
            const message = value.length < 2 ? 'Напишите, как к вам обращаться' : '';
            fieldError(name, message);
            if (message && !firstInvalid) firstInvalid = name;
        }

        const contact = form.elements.contact;
        if (contact) {
            const value = contact.value.trim();
            let message = '';
            if (!value) message = 'Оставьте телефон или email';
            else if (!EMAIL_RE.test(value) && !PHONE_RE.test(value)) message = 'Проверьте формат: +7 900 000-00-00 или mail@example.com';
            fieldError(contact, message);
            if (message && !firstInvalid) firstInvalid = contact;
        }

        if (firstInvalid) firstInvalid.focus();
        return !firstInvalid;
    }

    function sendForm(form) {
        const status = form.querySelector('[data-form-status]');
        const submit = form.querySelector('button[type="submit"]');
        const submitLabel = submit.textContent;

        submit.disabled = true;
        submit.textContent = 'Отправляем…';

        // Демо: имитируем задержку сети, чтобы состояние кнопки было видно
        setTimeout(() => {
            if (status) {
                status.textContent = 'Заявка принята. В демо-режиме письмо не отправляется — на боевом сайте мы бы ответили в течение дня.';
                status.classList.add('is-visible');
            }
            form.reset();
            submit.disabled = false;
            submit.textContent = submitLabel;

            if (form.closest('.modal')) setTimeout(closeModal, 2600);
        }, 700);

        /* Боевой режим — подставить свой endpoint:
        fetch('https://api.web3forms.com/submit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ access_key: 'ВАШ_КЛЮЧ', ...Object.fromEntries(new FormData(form)) })
        }).then(...)
        */
    }

    document.querySelectorAll('.form').forEach(form => {
        form.addEventListener('submit', event => {
            event.preventDefault();

            // Honeypot заполнен — молча выходим: это бот
            if (form.elements.company && form.elements.company.value) return;

            if (!validate(form)) return;
            if (DEMO_MODE) sendForm(form);
        });

        // Ошибка снимается сразу, как только поле начали править
        form.querySelectorAll('.form__input').forEach(input => {
            input.addEventListener('input', () => {
                if (input.classList.contains('is-invalid')) fieldError(input, '');
            });
        });
    });
});
