// Заменяет nodep/measure.go из libXray (scripts/build_core.sh).
//
// В оригинале реальная задержка всегда меряется запросом HEAD. Здесь способ
// выбирается в настройках пинга приложения: он передаётся во фрагменте адреса
// («https://…/generate_204#bproxy-method=GET»). Фрагмент на сервер не уходит:
// его отрезаем до запроса.
package nodep

import (
	"io"
	"math"
	"net/http"
	"net/url"
	"strings"
	"time"
)

const (
	PingDelayTimeout int64 = 11000
	PingDelayError   int64 = 10000
)

const methodMarker = "#bproxy-method="

// get the delay of some outbound.
// timeout means how long the http request will be cancelled if no response, in units of seconds.
// url means the website we use to test speed. "https://www.google.com" is a good choice for most cases.
// proxy means the local http/socks5 proxy, like "socks5://[::1]:1080". If proxy is empty, it means no proxy.
func MeasureDelay(timeout int, url string, proxy string) (int64, error) {
	httpTimeout := time.Second * time.Duration(timeout)
	c, err := CoreHTTPClient(httpTimeout, proxy)
	if err != nil {
		return PingDelayError, err
	}
	return PingHTTPRequest(c, url, timeout)
}

func CoreHTTPClient(timeout time.Duration, proxy string) (*http.Client, error) {
	tr := &http.Transport{
		DisableKeepAlives: true,
	}
	if len(proxy) > 0 {
		tr.Proxy = func(r *http.Request) (*url.URL, error) {
			return url.Parse(proxy)
		}
	}
	return &http.Client{Transport: tr, Timeout: timeout}, nil
}

// splitMethod отделяет способ запроса от адреса: HEAD (по умолчанию) или GET.
func splitMethod(target string) (string, string) {
	i := strings.Index(target, methodMarker)
	if i < 0 {
		return http.MethodHead, target
	}
	method := strings.ToUpper(target[i+len(methodMarker):])
	if method != http.MethodGet {
		method = http.MethodHead
	}
	return method, target[:i]
}

func PingHTTPRequest(c *http.Client, target string, timeout int) (int64, error) {
	method, target := splitMethod(target)
	start := time.Now()
	req, err := http.NewRequest(method, target, nil)
	if err != nil {
		return PingDelayError, err
	}
	response, err := c.Do(req)
	if err == nil && method == http.MethodGet {
		// GET считаем до конца ответа (не больше 64 КБ): так видно и скорость отдачи.
		_, err = io.Copy(io.Discard, io.LimitReader(response.Body, 64<<10))
	}
	delay := time.Since(start).Milliseconds()
	if response != nil {
		response.Body.Close()
	}
	if err != nil {
		precision := delay - int64(timeout)*1000
		if math.Abs(float64(precision)) < 50 {
			return PingDelayTimeout, err
		}
		return PingDelayError, err
	}
	return delay, nil
}
