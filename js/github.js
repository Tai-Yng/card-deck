/* GitHub Contents API：读取 / 写回 data/cards.json，实现网页端「拉取 / 推送」同步 */
(function () {
  'use strict';

  function utf8ToB64(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return btoa(bin);
  }

  function b64ToUtf8(b64) {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  window.GH = {
    CFG_KEY: 'carddeck.cfg',

    cfg() {
      try { return JSON.parse(localStorage.getItem(this.CFG_KEY) || 'null'); }
      catch (e) { return null; }
    },

    saveCfg(c) {
      try { localStorage.setItem(this.CFG_KEY, JSON.stringify(c)); }
      catch (e) { console.warn('保存设置失败（浏览器隐私模式？）', e); }
    },

    _url(c, withRef) {
      const path = String(c.path || 'data/cards.json').split('/').filter(Boolean)
        .map(encodeURIComponent).join('/');
      let url = 'https://api.github.com/repos/' + encodeURIComponent(c.owner) +
        '/' + encodeURIComponent(c.repo) + '/contents/' + path;
      if (withRef) url += '?ref=' + encodeURIComponent(c.branch || 'main') + '&_t=' + Date.now();
      return url;
    },

    _headers(c) {
      const h = { 'Accept': 'application/vnd.github+json' };
      if (c.token) h['Authorization'] = 'Bearer ' + c.token;
      return h;
    },

    /* 返回 { text, sha }；文件不存在返回 null；其余错误抛异常 */
    async getFile(c) {
      const res = await fetch(this._url(c, true), { headers: this._headers(c), cache: 'no-store' });
      if (res.status === 404) {
        /* 404 有三种可能：仓库不存在（或私有）、分支写错、文件还没创建。
           借一次仓库级查询区分，避免把「配置错误」误报成「文件不存在」。 */
        try {
          const rr = await fetch('https://api.github.com/repos/'
            + encodeURIComponent(c.owner) + '/' + encodeURIComponent(c.repo),
            { headers: this._headers(c) });
          if (rr.status === 404) {
            throw new Error('仓库不存在或为私有：请检查 owner / repo（私有仓库需填写 Token 才能读取）');
          }
          if (rr.ok) {
            const rj = await rr.json();
            const want = c.branch || 'main';
            if (rj.default_branch && rj.default_branch !== want) {
              throw new Error('分支「' + want + '」不存在：该仓库默认分支是「' + rj.default_branch + '」，请在设置中修改');
            }
          }
        } catch (e) {
          if (e instanceof Error && e.message.indexOf('不存在') !== -1) throw e;
          /* 仓库检查自身的网络异常：忽略，按文件不存在处理 */
        }
        return null;
      }
      if (res.status === 401) throw new Error('Token 无效或已过期（401）');
      if (res.status === 403) throw new Error('无权限或触发 API 限流（403）');
      if (!res.ok) throw new Error('GitHub API 错误（' + res.status + '），请检查仓库名 / 分支');
      const j = await res.json();
      if (j.type !== 'file' || j.encoding !== 'base64') throw new Error('远程路径不是普通文本文件');
      return { text: b64ToUtf8(j.content.replace(/\s+/g, '')), sha: j.sha };
    },

    async putFile(c, text, sha, message) {
      const body = { message: message, content: utf8ToB64(text), branch: c.branch || 'main' };
      if (sha) body.sha = sha;
      const res = await fetch(this._url(c, false), {
        method: 'PUT',
        headers: this._headers(c),
        body: JSON.stringify(body)
      });
      if (res.status === 401) throw new Error('Token 无效或已过期（401）');
      if (res.status === 403) throw new Error('Token 无写入权限或触发限流（403）');
      if (res.status === 409) throw new Error('远端刚被修改（409），请再点一次同步');
      if (res.status === 422) throw new Error('SHA 不匹配（422），请再点一次同步');
      if (!res.ok) {
        let msg = '';
        try { msg = (await res.json()).message || ''; } catch (e) { /* 忽略 */ }
        throw new Error('GitHub API 错误（' + res.status + '）' + (msg ? '：' + msg : ''));
      }
      return res.json();
    }
  };
})();
