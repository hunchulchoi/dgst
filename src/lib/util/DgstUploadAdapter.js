class DgstUploadAdapter {
	constructor(loader) {
		this.loader = loader;
	}

	upload() {
		return this.loader.file
			.then(
				(file) =>
					new Promise((resolve, reject) => {
						this._initRequest();
						this._initListeners(resolve, reject, file);
						this._sendRequest(file);
					})
			)
			.catch((error) => console.error(error));
	}
	abort() {
		if (this.xhr) {
			this.xhr.abort();
		}
	}
	_initRequest() {
		console.log('_initRequest()');
		const xhr = (this.xhr = new XMLHttpRequest());

		xhr.open('POST', '/board/upload', true);
		xhr.responseType = 'json';
	}

	// xhr 리스너 초기화 하기
	_initListeners(resolve, reject, file) {
		console.log('_initListeners()', file);

		const xhr = this.xhr;
		const loader = this.loader;
		const genericErrorText = '파일 업로드 중 오류가 발생하였습니다.';

		console.log('xhr', xhr);

		xhr.addEventListener('error', () => reject(genericErrorText));
		xhr.addEventListener('abort', () => reject('파일 업로드가 취소 되었습니다.'));
		xhr.addEventListener('load', () => {
			const response = xhr.response;

			// xhr response 객체가 error와 함께 올 수 있으며 이에러는 메세지를 가지며
			// 이 메시지는 업로드 프로미스의 매개변수로 넘어갈 수 있다.
			if (!response || response.error) {
				return reject(response && response.error ? response.error.message : genericErrorText);
			}

			resolve({
				default: response.url
			});

			// 파일로더는 uploadTotal과 upload properties 두개의 속성을 갖는다.
			// 이두개의 속성으로 에디터에서 업로드 진행상황을 표시 할 수 있다.
			if (xhr.upload) {
				xhr.upload.addEventListener('progress', (evt) => {
					if (evt.lengthComputable) {
						loader.uploadTotal = evt.total;
						loader.uploaded = evt.loaded;
					}
				});
			}
		});
	}

	// 데이터를 준비하고 서버에 전송한다.
	_sendRequest(file) {
		console.log('_sendRequest', file);

		const data = new FormData();
		data.append('upload', file);

		this.xhr.send(data);
	}
}

export default DgstUploadAdapter;
